const mysql = require('mysql2/promise');

const SUPPRESS_TITLES = new Set(['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Shri', 'Smt.', 'Er.', 'Prof.', 'Capt.', 'Col.', 'Maj.']);

function buildDisplayName(fullName, nameTitle) {
  const name = (fullName ?? '').trim();
  if (!nameTitle) {
    return name;
  }
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
    // Check if name_title column exists in users table
    const [columns] = await connection.execute('SHOW COLUMNS FROM users');
    const hasNameTitle = columns.some(col => col.Field === 'name_title');

    const selectFields = [
      'u.id AS userid',
      'u.full_name AS name',
      'u.username',
      'u.status',
      'mc.name AS membership_class',
      'm.lifecycle_state AS membership_status',
      'm.membership_number',
      'm.id AS membership_id',
      'ti.temp_identifier AS db_temp_number'
    ];

    if (hasNameTitle) {
      selectFields.push('u.name_title');
    }

    const query = `
      SELECT 
        ${selectFields.join(',\n        ')}
      FROM users u
      LEFT JOIN memberships m ON u.id = m.user_id
      LEFT JOIN membership_classes mc ON m.membership_class_id = mc.id
      LEFT JOIN membership_temp_identifiers ti ON m.id = ti.membership_id AND ti.status = 'ACTIVE'
      ORDER BY u.id ASC
    `;

    const [rows] = await connection.execute(query);

    const processed = rows.map(row => {
      const displayName = buildDisplayName(row.name, hasNameTitle ? row.name_title : null);
      
      // Compute temporary membership number if they have a membership but no permanent number assigned
      let computedTempNumber = null;
      if (row.membership_id && !row.membership_number) {
        computedTempNumber = `BCCTemp${String(row.membership_id).padStart(5, '0')}`;
      }

      // Final temporary membership number to display
      const tempMembershipNumber = row.db_temp_number || computedTempNumber || 'N/A';

      return {
        userid: row.userid,
        name: row.name,
        displayName: displayName,
        username: row.username || 'N/A',
        status: row.status,
        membershipClass: row.membership_class || 'N/A',
        membershipStatus: row.membership_status || 'N/A',
        membershipNumber: row.membership_number || 'N/A',
        temporaryMembershipNumber: tempMembershipNumber
      };
    });

    console.log(JSON.stringify(processed, null, 2));

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await connection.end();
  }
}

main();
