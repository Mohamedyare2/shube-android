import { DeviceHealthWidget } from '../components/DeviceHealthWidget'
import { useAuth } from '../contexts/AuthContext'

export default function OperatorDashboardPage() {
  const { user } = useAuth()

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">My Business Dashboard</h1>
          <p className="page-subtitle">Monitor your worker device and transactions</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
            Worker Device Status
          </h2>
          <DeviceHealthWidget operatorId={user?.id || ''} />
        </div>
        
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>
            Quick Actions
          </h2>
          <div className="card" style={{ padding: 'var(--space-6)' }}>
             <p className="text-gray-400 text-sm mb-4">
                To start automatically processing bundles, you need to pair an Android device with your account.
             </p>
             <button className="btn btn-primary" style={{ width: '100%' }}>
                Pair New Device
             </button>
          </div>
        </div>
      </div>
    </div>
  )
}
