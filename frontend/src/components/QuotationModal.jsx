import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { CreateQuotationModal } from './CreateQuotationModal'
import '../design-system'

function QuotationModal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { leadId, quotationId } = useParams()
  const backgroundLocation = location.state?.backgroundLocation
  const [leads, setLeads] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    void fetchLeads()
    if (quotationId) {
      void fetchQuotation()
    }
  }, [quotationId, leadId])

  const fetchLeads = async () => {
    try {
      const res = await api.get('/api/leads')
      setLeads(res.data)
    } catch {}
  }

  const fetchQuotation = async () => {
    try {
      const res = await api.get(`/api/quotations/${quotationId}`)
      setEditing(res.data)
    } catch {}
  }

  const handleSave = async (payload, editingQuotation) => {
    if (editingQuotation) {
      await api.put(`/api/quotations/${editingQuotation._id}`, payload)
    } else {
      await api.post('/api/quotations', payload)
    }
  }

  const handleClose = () => {
    // Use navigate(-1) to go back to the background location, preserving the list
    if (backgroundLocation) {
      navigate(-1)
    } else {
      // Determine the correct route based on the current path
      if (location.pathname.includes('/quotations/')) {
        navigate('/quotations', { replace: true })
      } else {
        navigate('/leads', { replace: true })
      }
    }
  }

  // Determine source based on the route
  const source = location.pathname.includes('/quotations/') ? 'quotations' : 'leads'

  return (
    <CreateQuotationModal
      isOpen={true}
      onClose={handleClose}
      onSave={handleSave}
      preSelectedLeadId={leadId}
      editing={editing}
      leads={leads}
      source={source}
    />
  )
}

export default QuotationModal
