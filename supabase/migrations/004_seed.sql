-- ============================================================
-- SHUBE — Migration 004: Seed Data
-- ============================================================

-- ============================================================
-- DEFAULT BUNDLE RULES
-- ============================================================
INSERT INTO public.bundle_rules (id, amount_sls, bundle_name, data_amount, data_unit, ussd_option, ussd_code, active, sort_order)
VALUES
    (uuid_generate_v4(), 5500,  '1 GB Bundle',   1,  'GB', '05', '*106*2*2*1*2*05#', TRUE, 1),
    (uuid_generate_v4(), 10000, '2 GB Bundle',   2,  'GB', '06', '*106*2*2*1*2*06#', TRUE, 2),
    (uuid_generate_v4(), 15000, '5 GB Bundle',   5,  'GB', '07', '*106*2*2*1*2*07#', TRUE, 3),
    (uuid_generate_v4(), 25000, '10 GB Bundle',  10, 'GB', '08', '*106*2*2*1*2*08#', TRUE, 4),
    (uuid_generate_v4(), 2000,  '500 MB Bundle', 500,'MB', '04', '*106*2*2*1*2*04#', TRUE, 5)
ON CONFLICT (amount_sls) DO NOTHING;

-- ============================================================
-- DEFAULT SMS PARSER CONFIG
-- Telesom payment SMS format:
--   "You have received 5,500 SLS from 0634284015. Ref: TXN123456"
--   OR: "Waxaad heshay 5,500 SLS oo ka timid 0634284015. Ref: TXN123456"
-- ============================================================
INSERT INTO public.sms_parser_config (id, name, description, sender_pattern, amount_pattern, currency_pattern, txn_id_pattern, active, priority)
VALUES
    (
        uuid_generate_v4(),
        'Telesom English',
        'Telesom payment SMS in English format',
        NULL,
        '(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*SLS',
        'SLS',
        'Ref[:\s]+([A-Za-z0-9]+)',
        TRUE,
        10
    ),
    (
        uuid_generate_v4(),
        'Telesom Somali',
        'Telesom payment SMS in Somali format',
        NULL,
        '(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*SLS',
        'SLS',
        'Ref[:\s]+([A-Za-z0-9]+)',
        TRUE,
        5
    )
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- DEFAULT USSD CONFIG
-- Configurable USSD workflow for Somtel bundle purchase
-- ============================================================
INSERT INTO public.ussd_config (id, name, description, steps, active)
VALUES
    (
        uuid_generate_v4(),
        'Somtel Bundle Purchase',
        'Default USSD workflow for purchasing Somtel internet bundles via *106#',
        '[
            {
                "step": 1,
                "type": "DIAL",
                "description": "Dial initial USSD code with bundle option",
                "ussd_code_template": "*106*2*2*1*2*{bundle_option}#",
                "timeout_ms": 10000
            },
            {
                "step": 2,
                "type": "WAIT_RESPONSE",
                "description": "Wait for USSD menu response",
                "timeout_ms": 15000,
                "expected_contains": []
            },
            {
                "step": 3,
                "type": "ENTER_NUMBER",
                "description": "Enter destination Somtel number",
                "field": "somtel_number",
                "timeout_ms": 10000
            },
            {
                "step": 4,
                "type": "ENTER_PIN",
                "description": "Enter operator USSD PIN (from secure local storage)",
                "field": "pin",
                "timeout_ms": 10000
            },
            {
                "step": 5,
                "type": "SEND_REPLY",
                "description": "Confirm transaction",
                "value": "1",
                "timeout_ms": 10000
            },
            {
                "step": 6,
                "type": "READ_RESPONSE",
                "description": "Read final USSD response to determine success/failure",
                "success_patterns": ["successful", "success", "confirmed", "done", "OK"],
                "failure_patterns": ["failed", "error", "insufficient", "invalid", "not found"],
                "timeout_ms": 20000
            }
        ]'::JSONB,
        TRUE
    )
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SAMPLE CUSTOMER (for testing)
-- ============================================================
INSERT INTO public.customers (id, customer_name, telesom_number, somtel_number, active)
VALUES
    (uuid_generate_v4(), 'Ahmed (Test Customer)', '0634284015', '0657575175', TRUE)
ON CONFLICT (telesom_number) DO NOTHING;

-- ============================================================
-- NOTES: Create the admin user via Supabase Auth dashboard or CLI:
--
--   supabase auth admin create-user \
--     --email admin@shube.so \
--     --password "ChangeMe123!" \
--     --user-metadata '{"role":"admin","full_name":"System Admin"}'
--
-- Then update the profile to ensure role = 'admin':
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<admin-user-uuid>';
-- ============================================================
