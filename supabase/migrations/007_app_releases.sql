-- ============================================================
-- SHUBE — Migration 007: App Releases Table
-- Stores Android APK release history for the Downloads page
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_releases (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    version           TEXT        NOT NULL,
    version_code      INTEGER     NOT NULL UNIQUE,
    release_notes     TEXT,
    apk_url           TEXT        NOT NULL,
    file_size_bytes   BIGINT,
    is_latest         BOOLEAN     NOT NULL DEFAULT FALSE,
    force_update      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_releases_is_latest     ON public.app_releases(is_latest);
CREATE INDEX IF NOT EXISTS idx_app_releases_version_code  ON public.app_releases(version_code DESC);

-- ============================================================
-- RLS — Only admins can insert/update/delete; everyone can read
-- ============================================================
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_releases_read_all"
    ON public.app_releases FOR SELECT
    USING (TRUE);

CREATE POLICY "app_releases_admin_write"
    ON public.app_releases FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- Seed: Insert the current v1.0.0 release as the latest
-- (APK is served from /downloads/shube-latest.apk)
-- ============================================================
INSERT INTO public.app_releases (
    version,
    version_code,
    release_notes,
    apk_url,
    file_size_bytes,
    is_latest,
    force_update
) VALUES (
    '1.0.0',
    1,
    'Nooca ugu horeeyay ee SHUBE Gateway App. Waxaa ku jira: USSD auto-processing, SMS parsing, Supabase real-time sync, iyo secure device pairing.',
    '/downloads/shube-latest.apk',
    25961298,
    TRUE,
    FALSE
)
ON CONFLICT (version_code) DO NOTHING;
