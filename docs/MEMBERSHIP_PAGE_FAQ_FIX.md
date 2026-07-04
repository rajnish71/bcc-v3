# Membership Page — FAQ Constitutional Fix

**Status:** Pending (pre-Phase 1 build)  
**Governs:** MEM-006 Public Domain Visibility Policy  
**Filed:** 2026-07-04

---

## The Violation

The Phase 0.5 wireframe (`BCC_Membership_Wireframe_-_Standalone.html`) contains
the following FAQ question in the public Membership page:

> **"Can I upgrade my membership class later?"**

This violates MEM-006's absolute public-domain invisibility policy.
The question implicitly reveals to the public that:
- Multiple membership classes exist beyond the three publicly visible ones.
- An "upgrade" pathway exists.

Neither of these facts may appear on any public-facing page, section,
footnote, or CTA — not even as implied language.

---

## Required Fix (apply when building the Astro Membership page)

**Remove** the FAQ item "Can I upgrade my membership class later?"  
**Replace** with a constitutionally safe alternative, such as:

> **"Can I change my membership type after joining?"**  
> Yes. Registered members can review available membership options and
> submit a new application from inside the Member Hub at any time.

This replacement:
- Does not name or imply any hidden class.
- Does not use the word "upgrade" (implies a hierarchy visible to the public).
- Correctly references the Member Hub as the gate — where hidden classes
  are legitimately surfaced only to logged-in registered users.

---

## Other FAQ Items Checked (all clean)

| Question | Status |
|---|---|
| What documents do I need for Student Membership? | ✅ Student Member is publicly visible |
| Is there a refund policy? | ✅ No class references |
| (all other items reviewed) | ✅ |
