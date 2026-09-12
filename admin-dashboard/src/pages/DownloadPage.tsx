import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

interface AppRelease {
  id: string
  version: string
  version_code: number
  release_notes: string | null
  apk_url: string
  file_size_bytes: number | null
  is_latest: boolean
  force_update: boolean
  created_at: string
  created_by: string | null
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function DownloadPage() {
  const { toast } = useToast()
  const { isAdmin } = useAuth()

  const [releases, setReleases] = useState<AppRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<AppRelease | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    version: '',
    version_code: '',
    release_notes: '',
    force_update: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('app_releases')
      .select('*')
      .order('version_code', { ascending: false })
    if (data) setReleases(data as AppRelease[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const latest = releases.find(r => r.is_latest) ?? releases[0] ?? null

  const fallbackLatest: AppRelease = {
    id: 'local-latest',
    version: '1.0.0',
    version_code: 1,
    release_notes: 'Nooca ugu dambeeyay ee Shube Android Gateway (USSD + SMS Automated Processing)',
    apk_url: '/downloads/shube-latest.apk',
    file_size_bytes: 25923073, // ~24.72 MB
    is_latest: true,
    force_update: false,
    created_at: new Date().toISOString(),
    created_by: null,
  }

  const activeRelease = latest || fallbackLatest

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast('Dooro APK file-ka marka hore', 'error'); return }
    if (!form.version || !form.version_code) { toast('Version iyo Version Code waajib ah', 'error'); return }
    if (!file.name.endsWith('.apk')) { toast('File-ku waa inuu noqdaa .apk', 'error'); return }

    setUploading(true)
    setUploadProgress(10)

    try {
      // Upload APK to Supabase Storage (bucket: app-releases)
      const fileName = `shube-v${form.version}-${Date.now()}.apk`
      setUploadProgress(30)

      const { error: uploadErr } = await supabase.storage
        .from('app-releases')
        .upload(fileName, file, { upsert: false, contentType: 'application/vnd.android.package-archive' })

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)
      setUploadProgress(70)

      // Get public URL
      const { data: urlData } = supabase.storage.from('app-releases').getPublicUrl(fileName)
      const apkUrl = urlData.publicUrl

      setUploadProgress(85)

      // Mark all existing releases as not-latest
      await supabase.from('app_releases').update({ is_latest: false }).neq('id', '00000000-0000-0000-0000-000000000000')

      // Insert new release record
      const { error: dbErr } = await supabase.from('app_releases').insert({
        version: form.version,
        version_code: parseInt(form.version_code),
        release_notes: form.release_notes || null,
        apk_url: apkUrl,
        file_size_bytes: file.size,
        is_latest: true,
        force_update: form.force_update,
      })
      if (dbErr) throw new Error(dbErr.message)

      setUploadProgress(100)
      toast(`✅ App v${form.version} waa la dhejiyay!`, 'success')
      setShowUploadForm(false)
      setForm({ version: '', version_code: '', release_notes: '', force_update: false })
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleDelete(r: AppRelease) {
    // Delete from storage
    const fileName = r.apk_url.split('/').pop()
    if (fileName) {
      await supabase.storage.from('app-releases').remove([fileName])
    }
    // Delete from DB
    const { error } = await supabase.from('app_releases').delete().eq('id', r.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Release deleted', 'success')
    setDeleteConfirm(null)
    load()
  }

  async function toggleLatest(r: AppRelease) {
    await supabase.from('app_releases').update({ is_latest: false }).neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('app_releases').update({ is_latest: true }).eq('id', r.id)
    toast(`v${r.version} hadda waa latest`, 'success')
    load()
  }

  function copyLink(url: string, label: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2500)
      toast('Link-ka waa la koobiyeeyay!', 'success')
    })
  }

  function shareWhatsApp(r: AppRelease) {
    const msg = encodeURIComponent(
      `📱 *SHUBE App Download*\n\n` +
      `Version: *v${r.version}*\n` +
      `${r.release_notes ? `📝 ${r.release_notes}\n\n` : '\n'}` +
      `🔗 Halkan ka soo dajiso:\n${r.apk_url}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">📥 Downloads</h1>
          <p className="page-subtitle">Soo deji SHUBE Android App (Gateway) oo ku xidh Dashboard-ka</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowUploadForm(true)}>
            ⬆️ Upload New Version
          </button>
        )}
      </div>

      {/* ── Latest Release Hero Card ──────────────────────────────────── */}
      {activeRelease && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.08) 100%)',
          border: '1.5px solid rgba(59,130,246,0.3)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          marginBottom: 'var(--space-5)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background glow */}
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontSize: '3rem' }}>📱</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 800 }}>
                      SHUBE Gateway App
                    </h2>
                    <span style={{
                      background: 'rgba(16,185,129,0.2)', color: '#34D399',
                      border: '1px solid rgba(16,185,129,0.4)',
                      borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700
                    }}>
                      ✓ LATEST
                    </span>
                    {activeRelease.force_update && (
                      <span style={{
                        background: 'rgba(239,68,68,0.15)', color: '#F87171',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700
                      }}>
                        ⚠️ FORCE UPDATE
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
                    Version <strong style={{ color: 'var(--brand-accent)' }}>v{activeRelease.version}</strong>
                    &nbsp;·&nbsp; Build {activeRelease.version_code}
                    &nbsp;·&nbsp; {formatBytes(activeRelease.file_size_bytes)}
                    &nbsp;·&nbsp; {formatDate(activeRelease.created_at)}
                  </div>
                </div>
              </div>
              {activeRelease.release_notes && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 'var(--space-2)', maxWidth: 500, lineHeight: 1.6 }}>
                  📝 {activeRelease.release_notes}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 200 }}>
              <a
                href={activeRelease.apk_url}
                download
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 'var(--radius-lg)',
                  background: 'var(--brand-primary)', color: 'white',
                  fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
                  transition: 'all 0.15s ease',
                }}
              >
                ⬇️ Download APK
              </a>
              <button
                onClick={() => shareWhatsApp(activeRelease)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 'var(--radius-lg)',
                  background: 'rgba(37,211,102,0.15)', color: '#25D366',
                  border: '1.5px solid rgba(37,211,102,0.4)',
                  fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Share via WhatsApp
              </button>
              <button
                onClick={() => copyLink(activeRelease.apk_url, activeRelease.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  color: copied === activeRelease.id ? 'var(--brand-success)' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {copied === activeRelease.id ? '✅ Copied!' : '🔗 Copy Download Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Geesh App Hero Card ──────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.08) 100%)',
        border: '1.5px solid rgba(16,185,129,0.3)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-5)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: '3rem' }}>💸</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 800 }}>
                    Geesh App
                  </h2>
                  <span style={{
                    background: 'rgba(16,185,129,0.2)', color: '#34D399',
                    border: '1px solid rgba(16,185,129,0.4)',
                    borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700
                  }}>
                    ✓ LATEST
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
                  Version <strong style={{ color: 'var(--brand-accent)' }}>v1.0.0</strong>
                  &nbsp;·&nbsp; Build 1
                  &nbsp;·&nbsp; 25.9 MB
                  &nbsp;·&nbsp; Geesh Automated Payment Processor
                </div>
              </div>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 'var(--space-2)', maxWidth: 500, lineHeight: 1.6 }}>
              📝 App-kan wuxuu si toos ah u akhriyaa fariimaha Adeega Sarifka (898) wuxuuna si toos ah dollar-ka ugu sii wadaa nambarka aad dooratay (USSD Auto-forward).
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 200 }}>
            <a
              href="/downloads/geesh-latest.apk"
              download
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 20px', borderRadius: 'var(--radius-lg)',
                background: '#10B981', color: 'white',
                fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              ⬇️ Download Geesh APK
            </a>
            <button
              onClick={() => copyLink(window.location.origin + '/downloads/geesh-latest.apk', 'geesh-apk')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                color: copied === 'geesh-apk' ? 'var(--brand-success)' : 'var(--text-secondary)',
                fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {copied === 'geesh-apk' ? '✅ Copied!' : '🔗 Copy Download Link'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Setup & Pairing Guide ────────────────────────────────────── */}
      <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-5)', background: 'var(--bg-surface-2)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📖</span> Habka Loo Xiro App-ka iyo Website-ka (3 Tallaabo)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-primary)', marginBottom: 4 }}>1. Soo Daji & Ku Shub</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Soo deji faylka APK-ga adigoo riixaya <strong>⬇️ Download APK</strong> ee sare, kadibna ku shub teleefankaaga Android-ka.
            </div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-primary)', marginBottom: 4 }}>2. Gali Xogta Website-ka</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Fur App-ka oo geli <strong>Username/Email</strong> iyo <strong>Password</strong>-ka aad website-kan ku gasho.
            </div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-primary)', marginBottom: 4 }}>3. Generate Code & Isku-xir</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Tag qaybta <strong>Devices</strong> ee menu-ga, riix <strong>Generate Code</strong>, 6-da lambar ku qor App-ka si ay isugu xirmaan.
            </div>
          </div>
        </div>
      </div>

      {/* ── All Releases Table ────────────────────────────────────────── */}
      {releases.length > 0 && (
        <div className="card">
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            All Releases ({releases.length})
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Build</th>
                  <th>Size</th>
                  <th>Release Notes</th>
                  <th>Status</th>
                  <th>Date</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array(3).fill(0).map((_, i) => (
                      <tr key={i}>{Array(isAdmin ? 7 : 6).fill(0).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>)}</tr>
                    ))
                  : releases.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: r.is_latest ? 'var(--brand-accent)' : 'var(--text-primary)' }}>
                            v{r.version}
                          </span>
                          {r.is_latest && (
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '99px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                              LATEST
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-mono" style={{ color: 'var(--text-muted)' }}>{r.version_code}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{formatBytes(r.file_size_bytes)}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.release_notes ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.force_update && (
                            <span style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '99px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>FORCE</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <a href={r.apk_url} download className="btn btn-secondary btn-sm">⬇️</a>
                            <button className="btn btn-ghost btn-sm" onClick={() => shareWhatsApp(r)} title="WhatsApp">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => copyLink(r.apk_url, r.id)} title="Copy link">
                              {copied === r.id ? '✅' : '🔗'}
                            </button>
                            {!r.is_latest && (
                              <button className="btn btn-secondary btn-sm" onClick={() => toggleLatest(r)} title="Set as latest">
                                ⭐
                              </button>
                            )}
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(r)}>🗑</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Upload Modal ──────────────────────────────────────────────── */}
      {showUploadForm && (
        <div className="modal-backdrop" onClick={() => !uploading && setShowUploadForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">⬆️ Upload New App Version</div>
              <button className="btn btn-ghost btn-sm btn-icon" disabled={uploading} onClick={() => setShowUploadForm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* File picker */}
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  border: '2px dashed rgba(59,130,246,0.4)', borderRadius: 'var(--radius-xl)',
                  padding: 'var(--space-6)', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
                  background: 'rgba(59,130,246,0.04)', transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-2)' }}>📦</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {fileRef.current?.files?.[0]?.name ?? 'Click to select APK file'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  .apk files only · Max 100MB
                </div>
                <input ref={fileRef} type="file" accept=".apk" style={{ display: 'none' }}
                  onChange={() => {
                    // Trigger re-render to show filename
                    setForm(f => ({ ...f }))
                  }}
                />
              </div>

              {/* Version fields */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Version Name *</label>
                  <input className="form-input table-mono" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.2.0" disabled={uploading} />
                  <span className="form-hint">Tusaale: 1.0, 1.2.1</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Version Code *</label>
                  <input type="number" className="form-input table-mono" value={form.version_code} onChange={e => setForm(f => ({ ...f, version_code: e.target.value }))} placeholder="5" disabled={uploading} />
                  <span className="form-hint">Nambarka uu App-ku u kala garan doono</span>
                </div>
              </div>

              {/* Release notes */}
              <div className="form-group">
                <label className="form-label">Release Notes (ikhtiyaar)</label>
                <textarea
                  className="form-input"
                  value={form.release_notes}
                  onChange={e => setForm(f => ({ ...f, release_notes: e.target.value }))}
                  placeholder="Waxaa la hagaajiyay: bug fixes, nidaam cusub..."
                  rows={3}
                  disabled={uploading}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Force update toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)' }}>
                <label className="toggle-wrapper" style={{ margin: 0 }}>
                  <div className={`toggle-track${form.force_update ? ' on' : ''}`} onClick={() => !uploading && setForm(f => ({ ...f, force_update: !f.force_update }))}>
                    <div className="toggle-thumb" />
                  </div>
                </label>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: form.force_update ? '#F87171' : 'var(--text-primary)' }}>
                    ⚠️ Force Update
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Haddii la shido, App-ku wuxuu Operator-ka ku qasbi doonaa inuu update gareeyo
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {uploading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: 'var(--brand-primary)',
                      width: `${uploadProgress}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" disabled={uploading} onClick={() => setShowUploadForm(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={uploading} onClick={handleUpload}>
                {uploading ? `Uploading... ${uploadProgress}%` : '⬆️ Upload & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Release</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Delete <strong style={{ color: 'var(--text-primary)' }}>v{deleteConfirm.version}</strong>?
                APK file-ku waa la tirtiri doonaa waa lagama noqon karo.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
