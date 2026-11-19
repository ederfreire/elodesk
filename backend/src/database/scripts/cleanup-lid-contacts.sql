-- Script para limpar contatos que ficaram com LID no campo de número
-- Execute no servidor: psql -U seu_usuario -d seu_banco -f cleanup-lid-contacts.sql

-- 1. Primeiro, veja os contatos afetados (apenas consulta)
SELECT c.id, c.name, c.number, c."companyId",
       wlm.lid, wlm.id as map_id
FROM "Contacts" c
LEFT JOIN "WhatsappLidMaps" wlm ON wlm."contactId" = c.id
WHERE length(c.number) >= 15
   OR c.number LIKE 'LID_%'
   OR c.number LIKE '0%' AND length(c.number) >= 15;

-- 2. Identificar contatos duplicados (mesmo nome, mesma empresa, um com número real e outro com LID)
SELECT 
  lid_contact.id as lid_contact_id,
  lid_contact.name,
  lid_contact.number as lid_number,
  real_contact.id as real_contact_id,
  real_contact.number as real_number
FROM "Contacts" lid_contact
JOIN "Contacts" real_contact 
  ON lid_contact.name = real_contact.name 
  AND lid_contact."companyId" = real_contact."companyId"
  AND lid_contact.id != real_contact.id
WHERE (length(lid_contact.number) >= 15 OR lid_contact.number LIKE 'LID_%')
  AND length(real_contact.number) < 15 
  AND real_contact.number NOT LIKE 'LID_%';

-- ============================================================
-- AÇÕES DE LIMPEZA (descomente para executar)
-- ============================================================

-- 3. Mover tickets dos contatos LID duplicados para o contato real
-- UPDATE "Tickets" t
-- SET "contactId" = real_contact.id
-- FROM "Contacts" lid_contact
-- JOIN "Contacts" real_contact 
--   ON lid_contact.name = real_contact.name 
--   AND lid_contact."companyId" = real_contact."companyId"
--   AND lid_contact.id != real_contact.id
-- WHERE (length(lid_contact.number) >= 15 OR lid_contact.number LIKE 'LID_%')
--   AND length(real_contact.number) < 15 
--   AND real_contact.number NOT LIKE 'LID_%'
--   AND t."contactId" = lid_contact.id;

-- 4. Mover mensagens dos contatos LID duplicados para o contato real
-- UPDATE "Messages" m
-- SET "contactId" = real_contact.id
-- FROM "Contacts" lid_contact
-- JOIN "Contacts" real_contact 
--   ON lid_contact.name = real_contact.name 
--   AND lid_contact."companyId" = real_contact."companyId"
--   AND lid_contact.id != real_contact.id
-- WHERE (length(lid_contact.number) >= 15 OR lid_contact.number LIKE 'LID_%')
--   AND length(real_contact.number) < 15 
--   AND real_contact.number NOT LIKE 'LID_%'
--   AND m."contactId" = lid_contact.id;

-- 5. Atualizar o mapeamento LID para apontar para o contato real
-- UPDATE "WhatsappLidMaps" wlm
-- SET "contactId" = real_contact.id
-- FROM "Contacts" lid_contact
-- JOIN "Contacts" real_contact 
--   ON lid_contact.name = real_contact.name 
--   AND lid_contact."companyId" = real_contact."companyId"
--   AND lid_contact.id != real_contact.id
-- WHERE (length(lid_contact.number) >= 15 OR lid_contact.number LIKE 'LID_%')
--   AND length(real_contact.number) < 15 
--   AND real_contact.number NOT LIKE 'LID_%'
--   AND wlm."contactId" = lid_contact.id;

-- 6. Deletar os contatos duplicados com LID
-- DELETE FROM "Contacts" 
-- WHERE id IN (
--   SELECT lid_contact.id
--   FROM "Contacts" lid_contact
--   JOIN "Contacts" real_contact 
--     ON lid_contact.name = real_contact.name 
--     AND lid_contact."companyId" = real_contact."companyId"
--     AND lid_contact.id != real_contact.id
--   WHERE (length(lid_contact.number) >= 15 OR lid_contact.number LIKE 'LID_%')
--     AND length(real_contact.number) < 15 
--     AND real_contact.number NOT LIKE 'LID_%'
-- );

-- 7. Para contatos com LID que NÃO têm duplicata com número real,
--    prefixar com LID_ para identificação futura
-- UPDATE "Contacts"
-- SET number = 'LID_' || number
-- WHERE length(number) >= 15
--   AND number NOT LIKE 'LID_%'
--   AND id NOT IN (
--     SELECT lid_contact.id
--     FROM "Contacts" lid_contact
--     JOIN "Contacts" real_contact 
--       ON lid_contact.name = real_contact.name 
--       AND lid_contact."companyId" = real_contact."companyId"
--       AND lid_contact.id != real_contact.id
--     WHERE length(real_contact.number) < 15
--   );
