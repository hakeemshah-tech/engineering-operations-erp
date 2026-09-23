import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import './hr.css'

export default function HRAlertsFeed({ limit = 20, onEmpty }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/hr-alerts?status=open')
      const data = Array.isArray(res.data) ? res.data.slice(0, limit) : []
      setAlerts(data)
      if (onEmpty && data.length === 0) onEmpty()
    } catch (err) {
      console.error('Failed to load alerts', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const act = async (id, action) => {
    try {
      await api.patch(`/api/hr-alerts/${id}/${action}`)
      load()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div className="hr-empty">Loading alerts…</div>
  if (alerts.length === 0) return <div className="hr-empty">No open alerts.</div>

  return (
    <div>
      {alerts.map(a => (
        <div key={a._id} className={`hr-alert-row ${a.severity}`}>
          <div className="hr-alert-msg">
            <div>{a.message}</div>
            <div className="hr-alert-meta">
              {a.alertType} · {a.severity} · {new Date(a.createdAt).toLocaleString()}
            </div>
          </div>
          <button className="hr-btn hr-btn-secondary" onClick={() => act(a._id, 'acknowledge')}>Ack</button>
          <button className="hr-btn hr-btn-secondary" onClick={() => act(a._id, 'dismiss')}>Dismiss</button>
        </div>
      ))}
    </div>
  )
}
