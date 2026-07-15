const mysql = require('mysql2/promise');

const SUPPRESS_TITLES = new Set(['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Shri', 'Smt.', 'Er.', 'Prof.', 'Capt.', 'Col.', 'Maj.']);

function buildDisplayName(fullName, nameTitle) {
  const name = (fullName ?? '').trim();
  if (!nameTitle) return name;
  for (const t of SUPPRESS_TITLES) {
    if (name.startsWith(t + ' ')) {
      return name.slice(t.length + 1).trim();
    }
  }
  if (nameTitle === 'Dr.' && !name.startsWith('Dr. ')) {
    return `Dr. ${name}`;
  }
  return name;
}

async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'bcc_v3_app',
    password: 'zAkuexH3yylvsguMNXwfeFXf',
    database: 'bcc_v3',
    port: 3307
  });

  try {
    // 1. Check schema columns to adapt queries dynamically
    const [userColumns] = await connection.execute('SHOW COLUMNS FROM users');
    const hasNameTitle = userColumns.some(col => col.Field === 'name_title');

    // 2. Fetch all raw data
    const [users] = await connection.execute('SELECT * FROM users');
    const [memberships] = await connection.execute('SELECT * FROM memberships');
    const [classes] = await connection.execute('SELECT * FROM membership_classes');
    const [roles] = await connection.execute(`
      SELECT ur.user_id, r.name AS role_name 
      FROM user_roles ur 
      JOIN roles r ON ur.role_id = r.id 
      WHERE ur.valid_until IS NULL OR ur.valid_until > NOW()
    `);
    const [tempIds] = await connection.execute('SELECT * FROM membership_temp_identifiers');

    // Mappings
    const classMap = {};
    classes.forEach(c => { classMap[c.id] = c.name; });

    const rolesMap = {};
    roles.forEach(r => {
      if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
      rolesMap[r.user_id].push(r.role_name);
    });

    const activeTempIdMap = {};
    const allTempIdsByMembership = {};
    tempIds.forEach(t => {
      if (!allTempIdsByMembership[t.membership_id]) {
        allTempIdsByMembership[t.membership_id] = [];
      }
      allTempIdsByMembership[t.membership_id].push(t);
      if (t.status === 'ACTIVE') {
        activeTempIdMap[t.membership_id] = t.temp_identifier;
      }
    });

    const membershipsByUserId = {};
    memberships.forEach(m => {
      if (m.user_id) {
        if (!membershipsByUserId[m.user_id]) membershipsByUserId[m.user_id] = [];
        membershipsByUserId[m.user_id].push(m);
      }
    });

    // 3. Process every user record
    const userRecords = users.map(user => {
      const userRoles = rolesMap[user.id] ? rolesMap[user.id].join(', ') : 'None';
      const userMemberships = membershipsByUserId[user.id] || [];

      // Find the primary or active membership, default to first if none active
      let membership = null;
      if (userMemberships.length > 0) {
        membership = userMemberships.find(m => m.lifecycle_state === 'ACTIVE') || userMemberships[0];
      }

      let mClass = 'None';
      let mStatus = 'None';
      let mNumber = 'N/A';
      let mTempNumber = 'N/A';

      if (membership) {
        mClass = classMap[membership.membership_class_id] || 'Unknown Class';
        mStatus = membership.lifecycle_state;
        mNumber = membership.membership_number || 'N/A';

        // Get temporary membership number
        const dbTemp = activeTempIdMap[membership.id];
        let computedTemp = null;
        if (!membership.membership_number) {
          computedTemp = `BCCTemp${String(membership.id).padStart(5, '0')}`;
        }
        mTempNumber = dbTemp || computedTemp || 'N/A';
      }

      const displayName = buildDisplayName(user.full_name, hasNameTitle ? user.name_title : null);

      return {
        userid: user.id,
        username: user.username || 'N/A',
        displayName: displayName,
        email: user.email || 'N/A',
        accountStatus: user.status,
        membershipStatus: mStatus,
        membershipClass: mClass,
        membershipNumber: mNumber,
        tempMembershipNumber: mTempNumber,
        roles: userRoles,
        rawUser: user,
        rawMemberships: userMemberships
      };
    });

    // 4. Sort the output: 1. Membership Number (where present), 2. User ID
    userRecords.sort((a, b) => {
      const hasA = a.membershipNumber !== 'N/A';
      const hasB = b.membershipNumber !== 'N/A';
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      if (hasA && hasB) {
        return a.membershipNumber.localeCompare(b.membershipNumber);
      }
      return a.userid - b.userid;
    });

    // 5. Generate statistics
    const stats = {
      totalUsers: users.length,
      accountStatusBreakdown: {},
      membershipStatusBreakdown: {},
      membershipClassBreakdown: {},
      roleBreakdown: {}
    };

    users.forEach(u => {
      stats.accountStatusBreakdown[u.status] = (stats.accountStatusBreakdown[u.status] || 0) + 1;
    });

    userRecords.forEach(rec => {
      stats.membershipStatusBreakdown[rec.membershipStatus] = (stats.membershipStatusBreakdown[rec.membershipStatus] || 0) + 1;
      stats.membershipClassBreakdown[rec.membershipClass] = (stats.membershipClassBreakdown[rec.membershipClass] || 0) + 1;
      
      const rolesList = rec.roles === 'None' ? ['None'] : rec.roles.split(', ');
      rolesList.forEach(r => {
        stats.roleBreakdown[r] = (stats.roleBreakdown[r] || 0) + 1;
      });
    });

    // 6. Data Validation Checks
    const validation = {
      duplicateUsernames: [],
      duplicateEmails: [],
      duplicateMembershipNumbers: [],
      missingMembershipClasses: [],
      invalidMembershipStatuses: [],
      orphanMemberships: [],
      membershipsWithoutUsers: [],
      usersWithMultipleActiveMemberships: [],
      unexpectedNullValues: [],
      membershipNumberAnomalies: []
    };

    // Duplicate Check maps
    const usernameMap = {};
    const emailMap = {};
    const mNumMap = {};

    users.forEach(u => {
      if (u.username) {
        const key = u.username.toLowerCase();
        if (!usernameMap[key]) usernameMap[key] = [];
        usernameMap[key].push(u);
      }
      if (u.email) {
        const key = u.email.toLowerCase();
        if (!emailMap[key]) emailMap[key] = [];
        emailMap[key].push(u);
      }
    });

    memberships.forEach(m => {
      if (m.membership_number && m.membership_number !== 'N/A') {
        const key = m.membership_number;
        if (!mNumMap[key]) mNumMap[key] = [];
        mNumMap[key].push(m);
      }
    });

    // Extract duplicates
    Object.keys(usernameMap).forEach(key => {
      if (usernameMap[key].length > 1) {
        validation.duplicateUsernames.push({ username: key, count: usernameMap[key].length, ids: usernameMap[key].map(u => u.id) });
      }
    });

    Object.keys(emailMap).forEach(key => {
      if (emailMap[key].length > 1) {
        validation.duplicateEmails.push({ email: key, count: emailMap[key].length, ids: emailMap[key].map(u => u.id) });
      }
    });

    Object.keys(mNumMap).forEach(key => {
      if (mNumMap[key].length > 1) {
        validation.duplicateMembershipNumbers.push({ number: key, count: mNumMap[key].length, ids: mNumMap[key].map(m => m.id), user_ids: mNumMap[key].map(m => m.user_id) });
      }
    });

    // Unexpected NULL / Empty Values
    users.forEach(u => {
      const nulls = [];
      if (!u.email && !u.phone) nulls.push('Both email and phone are missing/null');
      if (!u.full_name || u.full_name.trim() === '') nulls.push('Empty full_name');
      if (nulls.length > 0) {
        validation.unexpectedNullValues.push({ userid: u.id, username: u.username, issues: nulls });
      }
    });

    // Check membership class/state/orphans
    memberships.forEach(m => {
      const issues = [];
      if (m.membership_class_id === null || m.membership_class_id === undefined) {
        issues.push('Missing membership class ID');
        validation.missingMembershipClasses.push({ membership_id: m.id, user_id: m.user_id });
      }
      
      const validStates = ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'REJECTED'];
      if (!validStates.includes(m.lifecycle_state)) {
        issues.push(`Invalid membership status: ${m.lifecycle_state}`);
        validation.invalidMembershipStatuses.push({ membership_id: m.id, state: m.lifecycle_state });
      }

      if (!m.user_id) {
        validation.membershipsWithoutUsers.push({ membership_id: m.id, user_id: null });
      } else {
        const userExists = users.some(u => u.id === m.user_id);
        if (!userExists) {
          validation.orphanMemberships.push({ membership_id: m.id, user_id: m.user_id });
        }
      }
    });

    // Users with multiple active memberships
    Object.keys(membershipsByUserId).forEach(uid => {
      const userM = membershipsByUserId[uid];
      const activeM = userM.filter(m => m.lifecycle_state === 'ACTIVE');
      if (activeM.length > 1) {
        validation.usersWithMultipleActiveMemberships.push({
          userid: uid,
          count: activeM.length,
          membership_ids: activeM.map(m => m.id)
        });
      }
    });

    // MEM-007 compliance & Numbering Anomalies
    // Permanent number: BCC{YYYY}{MM}{SSSSS} — 14 characters. Sequential serials start at 00021 (operational). 
    // Serials 00001-00007 are founding reserved.
    memberships.forEach(m => {
      const mNum = m.membership_number;
      if (mNum) {
        // Check permanent pattern
        const permanentRegex = /^BCC\d{4}\d{2}\d{5}$/;
        const tempRegex = /^BCCTemp\d+$/;
        
        if (!permanentRegex.test(mNum) && !mNum.startsWith('BCCTemp')) {
          validation.membershipNumberAnomalies.push({
            membership_id: m.id,
            user_id: m.user_id,
            number: mNum,
            issue: 'Does not match permanent pattern (BCCYYYYMMSSSSS) or temporary prefix (BCCTemp)'
          });
        }

        if (permanentRegex.test(mNum)) {
          const serialStr = mNum.slice(9);
          const serial = parseInt(serialStr, 10);
          const year = parseInt(mNum.slice(3, 7), 10);
          const month = parseInt(mNum.slice(7, 9), 10);
          
          if (serial >= 1 && serial <= 7) {
            // Founding member
            // Verify join_year / join_month are populated appropriately
            if (m.join_year && m.join_year !== year) {
              validation.membershipNumberAnomalies.push({
                membership_id: m.id,
                user_id: m.user_id,
                number: mNum,
                issue: `Founding serial serial ${serialStr} has year mismatch: join_year=${m.join_year} vs number year=${year}`
              });
            }
          }
        }
      }
    });

    // Output all gathered data as a report object
    const auditReport = {
      timestamp: new Date().toISOString(),
      userRecords,
      stats,
      validation
    };

    console.log("AUDIT_REPORT_JSON_START");
    console.log(JSON.stringify(auditReport, null, 2));
    console.log("AUDIT_REPORT_JSON_END");

  } catch (error) {
    console.error('Audit execution error:', error);
  } finally {
    await connection.end();
  }
}

main();
