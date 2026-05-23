-- Backfill contacts.phone rows that had their India "91" country code
-- stripped by the previous normalizePhone() in src/lib/contact-merge.ts.
-- All inbound phone identifiers originate from Meta webhooks, which deliver
-- E.164 without '+', so any 10-digit row in this column is necessarily an
-- Indian mobile (prefix 6-9) that was stripped on insert.
--
-- Idempotent: only touches rows that are exactly 10 digits AND match the
-- Indian mobile pattern. Already-correct 12-digit rows and rows from other
-- countries (which would be 11+ digits) are left untouched.
update contacts
set phone = '91' || phone,
    updated_at = now()
where phone is not null
  and char_length(phone) = 10
  and phone ~ '^[6-9][0-9]{9}$';
