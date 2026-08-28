import type { TransactionStatus, DeviceStatus, ProfileStatus } from '../types/database'

// ── Status badge class lookup ─────────────────────────────────
export function txStatusClass(status: TransactionStatus): string {
  const map: Record<TransactionStatus, string> = {
    received:                  'badge-received',
    matched:                   'badge-processing',
    bundle_found:              'badge-processing',
    pending:                   'badge-pending',
    processing:                'badge-processing',
    ussd_started:              'badge-processing',
    authenticating:            'badge-processing',
    confirming:                'badge-processing',
    success:                   'badge-success',
    failed:                    'badge-failed',
    customer_not_found:        'badge-failed',
    invalid_amount:            'badge-failed',
    duplicate:                 'badge-duplicate',
    unknown_result:            'badge-unknown',
    ussd_interaction_required: 'badge-pending',
    queued:                    'badge-queued',
  }
  return map[status] ?? 'badge-unknown'
}

export function txStatusLabel(status: TransactionStatus): string {
  const map: Record<TransactionStatus, string> = {
    received:                  'Received',
    matched:                   'Matched',
    bundle_found:              'Bundle Found',
    pending:                   'Pending',
    processing:                'Processing',
    ussd_started:              'USSD Started',
    authenticating:            'Authenticating',
    confirming:                'Confirming',
    success:                   'Success',
    failed:                    'Failed',
    customer_not_found:        'Not Found',
    invalid_amount:            'Invalid Amount',
    duplicate:                 'Duplicate',
    unknown_result:            'Unknown',
    ussd_interaction_required: 'Action Required',
    queued:                    'Queued',
  }
  return map[status] ?? status
}

export function deviceStatusClass(status: DeviceStatus): string {
  const map: Record<DeviceStatus, string> = {
    online:     'badge-online',
    offline:    'badge-offline',
    processing: 'badge-processing',
    disabled:   'badge-disabled',
  }
  return map[status] ?? 'badge-unknown'
}

export function profileStatusClass(status: ProfileStatus): string {
  return status === 'active' ? 'badge-active' : 'badge-disabled'
}

// ── Number formatting ─────────────────────────────────────────
export function formatSLS(amount: number): string {
  return new Intl.NumberFormat('en-SO').format(amount) + ' SLS'
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

// ── Date formatting ───────────────────────────────────────────
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Phone formatting ──────────────────────────────────────────
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  if (phone.length <= 6) return phone
  return phone.slice(0, 4) + '••••' + phone.slice(-2)
}

// ── CSV Export ────────────────────────────────────────────────
export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '')
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Duration ──────────────────────────────────────────────────
export function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ── Is device online ─────────────────────────────────────────
export function isOnline(lastSeen: string | null, thresholdMinutes = 5): boolean {
  if (!lastSeen) return false
  return (Date.now() - new Date(lastSeen).getTime()) < thresholdMinutes * 60 * 1000
}
