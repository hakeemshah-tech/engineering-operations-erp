import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, NavLink, Routes, Route, useParams, Navigate } from 'react-router-dom'
import './Dashboard.css'
import UserManagement from './UserManagement'
import LeadManagement from './LeadManagement'
import ProjectManagement from './ProjectManagement'
import QuotationManagement from './QuotationManagement'
import RevisionManagement from './RevisionManagement'
import ProjectVariationManagement from './ProjectVariationManagement'
import UnifiedAuditLogs from './UnifiedAuditLogs'
import QuotationModal from './QuotationModal'
import EstimationsDashboard from './EstimationsDashboard'
import MainDashboard from './dashboards/MainDashboard'
import MyProjects from './MyProjects'
import InventoryDashboard from './dashboards/InventoryDashboard'
import ProcurementDashboard from './dashboards/ProcurementDashboard'
import InventoryManagement from './InventoryManagement'
import Settings from './Settings'
import MaterialRequestManagement from './MaterialRequestManagement'
import PurchaseRequestManagement from './PurchaseRequestManagement'
import PurchaseOrderManagement from './PurchaseOrderManagement'
import SupplierManagement from './SupplierManagement'
import CompanyManagement from './CompanyManagement'
import CompanyProfile from './CompanyProfile'
import DocumentManagement from './DocumentManagement'
import CredentialManagement from './CredentialManagement'
import VehicleManagement from './VehicleManagement'
import HRDashboard from './hr/HRDashboard'
import EmployeeManagement from './hr/EmployeeManagement'
import AttendanceManagement from './hr/AttendanceManagement'
import LeaveManagement from './hr/LeaveManagement'
import OffboardingManagement from './hr/OffboardingManagement'
import LocationManagement from './locations/LocationManagement'
import HolidayManagement from './hr/HolidayManagement'
import MyAttendance from './punch/MyAttendance'
import LocationGroupManagement from './locations/LocationGroupManagement'
import AccountsDashboard from './accounts/AccountsDashboard'
import ChartOfAccountsManagement from './accounts/ChartOfAccountsManagement'
import JournalEntryManagement from './accounts/JournalEntryManagement'
import SupplierBillManagement from './accounts/SupplierBillManagement'
import SalesClaimManagement from './accounts/SalesClaimManagement'
import SalaryPreparationManagement from './accounts/SalaryPreparationManagement'
import TallySyncQueue from './accounts/TallySyncQueue'
import VATReport from './accounts/VATReport'
import TallySetup from './accounts/TallySetup'
import AccountsSettings from './accounts/AccountsSettings'
import { isAccountsOnlyUser } from '../lib/roles'
import { initTheme, setTheme } from '../utils/theme'
import { api } from '../lib/api'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const photoSrc = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

/* ------------------------------------------------------------------------- *
 *  Sidebar configuration (icon rail + sticky-pinned flyout panel)
 *  Each top-level entry is either:
 *   - { type: 'link',  ... }  → direct NavLink on the rail
 *   - { type: 'group', ... }  → opens a flyout panel with sub-items
 *  The buildSidebarItems(user) function returns the role-filtered list.
 * ------------------------------------------------------------------------- */

const Icon = {
  dashboard:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>,
  punch:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>,
  estimations:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  hr:               <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
  inventory:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 8.5v7L12 21l10-5.5v-7L12 3zm0 2.31L19.45 9 12 12.69 4.55 9 12 5.31zM4 10.7l7 3.46v6.18l-7-3.86V10.7zm9 9.64v-6.18l7-3.46v5.78l-7 3.86z"/></svg>,
  procurement:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>,
  accounts:         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>,
  company:          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
  users:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 7c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-2 3c-1.48 0-4.5.75-4.5 2.25V14h9v-1.75C18.5 10.75 15.48 10 14 10z"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
  auditLogs:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>,
  settings:         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>,
  logout:           <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>,
  // Sub-item (small) icons:
  leads:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>,
  quotations:       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9a3 3 0 013 3v14a3 3 0 01-3 3H6a3 3 0 01-3-3V5a3 3 0 013-3zm2 5h7v2H8V7zm0 4h7v2H8v-2zm0 4h5v2H8v-2z"/></svg>,
  revisions:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h9a3 3 0 013 3v11a3 3 0 01-3 3H5a3 3 0 01-3-3V7a3 3 0 013-3zm2 4h7v2H7V8zm0 4h7v2H7v-2zm0 4h5v2H7v-2z"/></svg>,
  projects:         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  variations:       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-4v-4H5v-4h4V5h4v4h4v4z"/></svg>,
  employees:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
  attendance:       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>,
  leave:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  offboarding:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>,
  locations:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
  passwordReset:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>,
  inventoryMgmt:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-.9-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z"/></svg>,
  materialReq:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>,
  purchaseReq:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 10H8v-2h8v2zm0-4H8V7h8v2z"/></svg>,
  purchaseOrder:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h2v8l2.5-1.5L13 12V4h5v16z"/></svg>,
  suppliers:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>,
  chart:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  journals:         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>,
  bills:            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 10H8v-2h8v2zm0-4H8V7h8v2z"/></svg>,
  claims:           <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>,
  salary:           <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
  tallySync:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>,
  vat:              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 14h-2v-7h2v7zm-4 0h-2V7h2v10zm-4 0H7v-4h2v4z"/></svg>,
  tallySetup:       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>,
  acctSettings:     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>,
  profile:          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
  documents:        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>,
  credentials:      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.29 7.78-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>,
  vehicles:         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm11 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM5 11l1.5-4.5h11L19 11H5z"/></svg>
}

// Top-level base paths an accounts-only user (Account Manager) is allowed to
// visit besides /accounts: the procurement pages their sidebar exposes (and the
// PO detail page where they approve + assign account heads) plus self-service.
const ACCOUNTS_ONLY_ALLOWED_PATHS = [
  'accounts', 'purchase-orders', 'purchase-order-detail', 'my-attendance', 'punch', 'profile'
]

function buildSidebarItems(user) {
  if (!user) return []
  const roles = user.roles || []
  const has = (r) => roles.includes(r)
  const isAdmin = has('admin') || has('manager')
  const isEstimationRole = has('estimation_engineer') || has('sales_engineer') || has('project_engineer')
  const isOnlySpecialized = !isAdmin && roles.length > 0 && roles.every(r =>
    ['inventory_manager', 'store_keeper', 'procurement_engineer',
     'estimation_engineer', 'sales_engineer', 'project_engineer'].includes(r)
  )
  // Site-floor roles see a "My Projects" landing instead of the Main
  // Dashboard. PE is also covered because the user wants PEs scoped to
  // the projects they own. Note: a user with admin/manager keeps the
  // main dashboard regardless of these site roles.
  const isSiteFloorRole = !isAdmin && (has('site_supervisor') || has('supervisor') || has('site_worker') || has('project_engineer'))

  const items = [
    // ----- Direct: Main Dashboard (hidden for site-floor roles + only-specialized) -----
    (!isOnlySpecialized && !isSiteFloorRole) && {
      type: 'link', key: 'main-dashboard',
      label: 'Main Dashboard', to: '/dashboard', end: true,
      icon: Icon.dashboard,
      activePrefixes: ['/dashboard']
    },

    // ----- Direct: My Projects (site-floor roles + PE) -----
    isSiteFloorRole && {
      type: 'link', key: 'my-projects',
      label: 'My Projects', to: '/my-projects',
      icon: Icon.projects || Icon.dashboard,
      activePrefixes: ['/my-projects']
    },

    // ----- Direct: Punch -----
    // Punch & My Attendance are employee-side flows. Admin accounts are
    // not treated as employees in this flow - hide to keep their sidebar
    // focused. Managers still see them because they ARE employees here.
    !has('admin') && { type: 'link', key: 'punch', label: 'Punch', to: '/punch', icon: Icon.punch, activePrefixes: ['/punch'] },

    // ----- Direct: My Attendance (self-service) -----
    !has('admin') && { type: 'link', key: 'my-attendance', label: 'My Attendance', to: '/my-attendance', icon: Icon.attendance, activePrefixes: ['/my-attendance'] },

    // ----- Group: Estimations -----
    (isAdmin || isEstimationRole) && {
      type: 'group', key: 'estimations', label: 'Estimations', icon: Icon.estimations,
      routePrefixes: ['/estimations-dashboard', '/leads', '/quotations', '/revisions', '/projects', '/project-variations'],
      items: [
        isAdmin && { to: '/estimations-dashboard', label: 'Estimations Dashboard', icon: Icon.dashboard },
        (isAdmin || has('estimation_engineer') || has('sales_engineer')) && { to: '/leads', label: 'Leads', icon: Icon.leads },
        (isAdmin || has('estimation_engineer')) && { to: '/quotations', label: 'Quotations', icon: Icon.quotations },
        (isAdmin || has('estimation_engineer')) && { to: '/revisions', label: 'Revisions', icon: Icon.revisions },
        { to: '/projects', label: 'Projects', icon: Icon.projects },
        (isAdmin || has('estimation_engineer')) && { to: '/project-variations', label: 'Project Variations', icon: Icon.variations }
      ].filter(Boolean)
    },

    // ----- Group: HR -----
    (has('hr') || isAdmin || has('project_engineer') || has('supervisor') || has('site_supervisor') || has('site_engineer')) && {
      type: 'group', key: 'hr', label: 'HR Management', icon: Icon.hr,
      routePrefixes: ['/hr'],
      items: [
        (isAdmin || has('hr')) && { to: '/hr', end: true, label: 'HR Dashboard', icon: Icon.dashboard },
        (isAdmin || has('hr')) && { to: '/hr/employees', label: 'Employees', icon: Icon.employees },
        { to: '/hr/attendance', label: 'Attendance', icon: Icon.attendance },
        // Self-service: every authenticated user gets the Leave Requests
        // nav. HR / Manager / Admin / PE / SS / Supervisor see broader
        // rosters via the server's eligible-employees scoping; everyone else
        // just sees themselves and can apply for their own leave.
        { to: '/hr/leave', label: 'Leave Requests', icon: Icon.leave },
        (isAdmin || has('hr')) && { to: '/hr/offboarding', label: 'Offboarding', icon: Icon.offboarding },
        (isAdmin || has('hr') || has('project_engineer')) && { to: '/hr/locations', label: 'Locations', icon: Icon.locations },
        (isAdmin || has('hr') || has('project_engineer')) && { to: '/hr/location-groups', label: 'Location Groups', icon: Icon.locations },
        (isAdmin || has('manager') || has('hr')) && { to: '/hr/holidays', label: 'Holidays', icon: Icon.leave },
        (isAdmin || has('hr')) && { to: '/hr/password-resets', label: 'Password Resets', icon: Icon.passwordReset }
      ].filter(Boolean)
    },

    // ----- Group: Inventory -----
    (isAdmin || has('inventory_manager') || has('store_keeper') || has('project_engineer')) && {
      type: 'group', key: 'inventory', label: 'Inventory', icon: Icon.inventory,
      routePrefixes: ['/inventory-dashboard', '/inventory', '/material-requests'],
      items: [
        (isAdmin || has('inventory_manager') || has('store_keeper')) && { to: '/inventory-dashboard', label: 'Inventory Dashboard', icon: Icon.dashboard },
        (isAdmin || has('inventory_manager') || has('store_keeper')) && { to: '/inventory', label: 'Inventory Management', icon: Icon.inventoryMgmt },
        (isAdmin || has('inventory_manager') || has('project_engineer')) && { to: '/material-requests', label: 'Material Requests', icon: Icon.materialReq }
      ].filter(Boolean)
    },

    // ----- Group: Procurement -----
    (isAdmin || has('procurement_engineer') || has('inventory_manager') || has('account_manager')) && {
      type: 'group', key: 'procurement', label: 'Procurement', icon: Icon.procurement,
      routePrefixes: ['/procurement-dashboard', '/purchase-requests', '/purchase-orders', '/suppliers'],
      items: [
        (isAdmin || has('procurement_engineer')) && { to: '/procurement-dashboard', label: 'Procurement Dashboard', icon: Icon.dashboard },
        (isAdmin || has('procurement_engineer') || has('inventory_manager')) && { to: '/purchase-requests', label: 'Purchase Requests', icon: Icon.purchaseReq },
        (isAdmin || has('procurement_engineer') || has('inventory_manager') || has('account_manager')) && { to: '/purchase-orders', label: 'Purchase Orders', icon: Icon.purchaseOrder },
        (isAdmin || has('procurement_engineer')) && { to: '/suppliers', label: 'Suppliers', icon: Icon.suppliers }
      ].filter(Boolean)
    },

    // ----- Group: Accounts -----
    (isAdmin || has('account_manager')) && {
      type: 'group', key: 'accounts', label: 'Accounts', icon: Icon.accounts,
      routePrefixes: ['/accounts'],
      items: [
        { to: '/accounts', end: true, label: 'Accounts Dashboard', icon: Icon.dashboard },
        { to: '/accounts/chart', label: 'Chart of Accounts', icon: Icon.chart },
        { to: '/accounts/journals', label: 'Journal Entries', icon: Icon.journals },
        { to: '/accounts/bills', label: 'Supplier Bills', icon: Icon.bills },
        { to: '/accounts/claims', label: 'Sales Claims', icon: Icon.claims },
        { to: '/accounts/salary-preparation', label: 'Salary Preparation', icon: Icon.salary },
        { to: '/accounts/tally-sync', label: 'Tally Sync Queue', icon: Icon.tallySync },
        { to: '/accounts/vat-report', label: 'VAT 201 Report', icon: Icon.vat },
        { to: '/accounts/tally-setup', label: 'Tally Setup', icon: Icon.tallySetup },
        { to: '/accounts/settings', label: 'Accounts Settings', icon: Icon.acctSettings }
      ]
    },

    // ----- Group: Company -----
    isAdmin && {
      type: 'group', key: 'company', label: 'Company', icon: Icon.company,
      routePrefixes: ['/company'],
      items: [
        { to: '/company/profile', label: 'Profile', icon: Icon.profile },
        { to: '/company/documents', label: 'Documents', icon: Icon.documents },
        { to: '/company/credentials', label: 'Credentials', icon: Icon.credentials },
        { to: '/company/vehicles', label: 'Vehicles', icon: Icon.vehicles }
      ]
    },

    // ----- Direct: Users -----
    isAdmin && { type: 'link', key: 'users', label: 'Users', to: '/users', icon: Icon.users, activePrefixes: ['/users'] },

    // ----- Direct: Audit Logs -----
    (isAdmin || isEstimationRole) && {
      type: 'link', key: 'audit-logs', label: 'Audit Logs', to: '/audit-logs', icon: Icon.auditLogs, activePrefixes: ['/audit-logs']
    },

    // ----- Direct: Settings -----
    isAdmin && { type: 'link', key: 'settings', label: 'Settings', to: '/settings', icon: Icon.settings, activePrefixes: ['/settings'] }
  ].filter(Boolean)

  // Filter out groups whose sub-items all evaluated to false
  return items.filter(i => i.type === 'link' || (i.items && i.items.length > 0))
}

function Dashboard() {
  const [user, setUser] = useState(null)
  // Sticky-pinned flyout: which module group's sub-items are currently shown
  // alongside the rail. null = closed. Opens on initial mount if current route
  // matches a group. Then only changes via rail-icon click or close button.
  const [activeFlyout, setActiveFlyout] = useState(null)
  // Mobile-only sidebar drawer toggle. Desktop ignores this - the sidebar is
  // always visible there. On small screens the rail is hidden by default and
  // the hamburger button in the header opens it as a slide-in drawer.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const location = useLocation()
  const navigate = useNavigate()

  // Close the mobile drawer whenever the route changes (i.e. the user picked a
  // nav item). Desktop is unaffected because the class is only meaningful in
  // the @media (max-width: 768px) breakpoint. Must come AFTER useLocation() so
  // `location` is in scope.
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  // Profile photo for the sidebar + header avatars. /api/auth/me returns the
  // linked employee (if any); we only need its photoUrl. Falls back silently
  // to the initial-letter avatar when missing.
  const [photoUrl, setPhotoUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.get('/api/auth/me').then(res => {
      if (!cancelled) setPhotoUrl(res.data?.employee?.photoUrl || null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  
  // Check if we're on a modal route with background location
  const isModalRoute = location.pathname.includes('/create-quotation/')
  const backgroundLocation = location.state?.backgroundLocation
  
  // Use background location for main content when modal is open, otherwise use current location
  const mainContentLocation = backgroundLocation || location
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  useEffect(() => {
    try {
      const userDataStr = localStorage.getItem('user')
      const userData = userDataStr ? JSON.parse(userDataStr) : null
      setUser(userData)
    } catch (error) {
      console.error('Error loading user data:', error)
      setUser(null)
    }
    
    // When modal route is active, use backgroundLocation to determine activeTab
    // This ensures the Leads list stays visible behind the modal
    if (isModalRoute && backgroundLocation) {
      const pathSegments = backgroundLocation.pathname.split('/').filter(Boolean)
      const basePath = pathSegments[0] || 'dashboard'
      if (['dashboard','users','estimations-dashboard','inventory-dashboard','procurement-dashboard','leads','projects','quotations','revisions','project-variations','audit-logs','inventory','settings','material-requests','purchase-requests','purchase-orders','suppliers','company','hr','accounts','my-attendance','my-projects'].includes(basePath)) {
        setActiveTab(basePath)
      }
    } else if (isModalRoute && !backgroundLocation) {
      // Fallback: if modal route but no backgroundLocation, try to extract from current path
      // This handles cases where backgroundLocation might not be set
      if (location.pathname.includes('/leads/create-quotation/')) {
        setActiveTab('leads')
      } else {
        const pathSegments = location.pathname.split('/').filter(Boolean)
        const basePath = pathSegments[0] || 'dashboard'
        if (['dashboard','users','estimations-dashboard','inventory-dashboard','procurement-dashboard','leads','projects','quotations','revisions','project-variations','audit-logs','settings','material-requests','purchase-requests','purchase-orders','hr','accounts','my-attendance','my-projects'].includes(basePath)) {
          setActiveTab(basePath)
        }
      }
    } else {
      // Normal navigation - use current pathname
      const pathSegments = location.pathname.split('/').filter(Boolean)
      const basePath = pathSegments[0] || 'dashboard'
      if (['dashboard','users','estimations-dashboard','inventory-dashboard','procurement-dashboard','leads','projects','quotations','revisions','project-variations','audit-logs','inventory','settings','material-requests','purchase-requests','purchase-orders','suppliers','company','hr','accounts','my-attendance','my-projects'].includes(basePath)) {
        setActiveTab(basePath)
      }
    }
  }, [location.pathname, backgroundLocation, isModalRoute])

  useEffect(() => {
    setTheme(isDark)
  }, [isDark])

  const sidebarItems = useMemo(() => buildSidebarItems(user), [user])

  // Auto-open the flyout matching the user's current route, but only once after
  // login. After that, the user controls the flyout via rail clicks (sticky-pinned).
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenedRef.current) return
    if (!user || sidebarItems.length === 0) return
    const path = location.pathname
    const match = sidebarItems.find(it =>
      it.type === 'group' && it.routePrefixes.some(p => path === p || path.startsWith(p + '/'))
    )
    if (match) setActiveFlyout(match.key)
    autoOpenedRef.current = true
  }, [user, sidebarItems, location.pathname])

  const isAccountsOnly = isAccountsOnlyUser(user)

  useEffect(() => {
    // Accounts-only users (e.g. an Account Manager with no other role) are
    // funnelled to /accounts as their home, but must still reach the self-service
    // and procurement pages their sidebar offers - Purchase Orders (to approve),
    // My Attendance, Punch, and their Profile. Only bounce truly off-limits paths
    // (e.g. the generic Main Dashboard) back to /accounts.
    if (!user) return
    if (!isAccountsOnly) return
    const basePath = location.pathname.split('/').filter(Boolean)[0] || 'dashboard'
    if (!ACCOUNTS_ONLY_ALLOWED_PATHS.includes(basePath)) {
      navigate('/accounts', { replace: true })
    }
  }, [user, isAccountsOnly, location.pathname, navigate])

  const handleLogout = () => {
    setShowLogoutModal(true)
  }

  const confirmLogout = async () => {
    try {
      // Call logout endpoint to log the action
      try {
        await api.post('/api/auth/logout')
      } catch (error) {
        // Don't block logout if API call fails
        console.error('Error calling logout endpoint:', error)
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Always clear local storage and redirect
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/'
    }
  }

  return (
    <div className="dashboard">
      {/* Tap-anywhere backdrop while the mobile drawer is open */}
      {mobileNavOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-rail">
          <div className="sidebar-rail-header" title="Engineering Operations ERP">
            <div className="logo-icon">W</div>
          </div>
          <nav className="sidebar-rail-nav">
            {sidebarItems.map(item => {
              if (item.type === 'link') {
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `rail-item ${isActive ? 'active' : ''}`}
                    title={item.label}
                    aria-label={item.label}
                  >
                    {item.icon}
                  </NavLink>
                )
              }
              const isGroupActive = item.routePrefixes.some(p =>
                location.pathname === p || location.pathname.startsWith(p + '/')
              )
              const isOpen = activeFlyout === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`rail-item ${isGroupActive ? 'active' : ''} ${isOpen ? 'rail-item-pinned' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={isOpen}
                  onClick={() => setActiveFlyout(isOpen ? null : item.key)}
                >
                  {item.icon}
                </button>
              )
            })}
          </nav>
          <div className="sidebar-rail-footer">
            <button
              type="button"
              className="rail-item rail-profile"
              title={user?.name ? `${user.name} — open profile` : 'My profile'}
              aria-label="My profile"
              onClick={() => navigate('/profile')}
            >
              <div className="rail-avatar" style={photoUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : undefined}>
                {photoUrl
                  ? <img src={photoSrc(photoUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : (user?.name?.charAt(0) || '?')}
              </div>
            </button>
            <button
              type="button"
              className="rail-item rail-logout"
              title="Logout"
              aria-label="Logout"
              onClick={handleLogout}
            >
              {Icon.logout}
            </button>
          </div>
        </div>

        {activeFlyout && (() => {
          const group = sidebarItems.find(it => it.key === activeFlyout && it.type === 'group')
          if (!group) return null
          return (
            <aside className="sidebar-flyout" aria-label={`${group.label} navigation`}>
              <div className="sidebar-flyout-header">
                <h3 className="sidebar-flyout-title">{group.label}</h3>
                <button
                  type="button"
                  className="sidebar-flyout-close"
                  onClick={() => setActiveFlyout(null)}
                  aria-label="Close panel"
                  title="Close panel"
                >×</button>
              </div>
              <nav className="sidebar-flyout-nav">
                {group.items.map(sub => (
                  <NavLink
                    key={sub.to}
                    to={sub.to}
                    end={sub.end}
                    className={({ isActive }) => `flyout-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="flyout-item-icon">{sub.icon}</span>
                    <span className="flyout-item-label">{sub.label}</span>
                  </NavLink>
                ))}
              </nav>
            </aside>
          )
        })()}
      </div>

      <div className={`main-content ${activeFlyout ? 'flyout-open' : ''}`}>
        <header className="header">
          <div className="header-left">
            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setMobileNavOpen(o => !o)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6"  x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button className="theme-toggle-dash" onClick={() => setIsDark(!isDark)}>
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd"/>
                </svg>
              )}
            </button>
            <div>
              <h1>
              {activeTab === 'dashboard' && 'Main Dashboard'}
              {activeTab === 'estimations-dashboard' && 'Estimations Dashboard'}
              {activeTab === 'inventory-dashboard' && 'Inventory Dashboard'}
              {activeTab === 'procurement-dashboard' && 'Procurement Dashboard'}
              {activeTab === 'users' && 'User Management'}
              {activeTab === 'leads' && 'Lead Management'}
              {activeTab === 'projects' && 'Project Management'}
              {activeTab === 'quotations' && 'Quotation Management'}
              {activeTab === 'revisions' && 'Revisions Management'}
              {activeTab === 'audit-logs' && 'Audit Logs'}
              {activeTab === 'project-variations' && 'Project Variations'}
              {activeTab === 'inventory' && 'Inventory Management'}
              {activeTab === 'settings' && 'Settings'}
              {activeTab === 'material-requests' && 'Material Requests'}
              {activeTab === 'purchase-requests' && 'Purchase Requests'}
              {activeTab === 'purchase-orders' && 'Purchase Orders'}
              {activeTab === 'suppliers' && 'Supplier Management'}
              {activeTab === 'company' && 'Company Management'}
              {activeTab === 'hr' && 'HR Management'}
              {activeTab === 'accounts' && 'Accounts'}
              {activeTab === 'my-attendance' && 'My Attendance'}
            </h1>
              <p>Welcome back, {user?.name}!</p>
            </div>
          </div>
          <div className="header-right">
            <button
              type="button"
              className="user-profile"
              onClick={() => navigate('/profile')}
              title="My profile"
              style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
            >
              <div className="avatar" style={photoUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : undefined}>
                {photoUrl
                  ? <img src={photoSrc(photoUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : (user?.name?.charAt(0))}
              </div>
              <span>{user?.name}</span>
            </button>
          </div>
        </header>
        
        <div className="content">
          {activeTab === 'dashboard' && (() => {
            // /dashboard is the Main Dashboard for Admin and Manager.
            // Site-floor roles (site_supervisor / supervisor / site_worker /
            // project_engineer) are redirected to /my-projects - they only
            // see the projects they are assigned to.
            // Other specialized roles go to their own dashboard.
            // activeTab defaults to 'dashboard' and is synced to the real route
            // only by an effect after the first render. Guard against acting on a
            // stale 'dashboard' tab while the URL is actually a sub-route (e.g.
            // /accounts/chart on refresh) - otherwise we'd wrongly redirect.
            const basePath = location.pathname.split('/').filter(Boolean)[0] || 'dashboard'
            if (basePath !== 'dashboard') return null
            const roles = user?.roles || []
            const isAdminManager = roles.includes('admin') || roles.includes('manager')
            if (!isAdminManager) {
              // Accounts-only users have no use for the generic Main Dashboard
              // (it loads procurement/PR data they can't access) - send them home.
              if (isAccountsOnly) {
                return <Navigate to="/accounts" replace />
              }
              // Site-floor roles take precedence - even a PE who also has
              // estimation-side assignments lands on /my-projects.
              if (roles.includes('site_supervisor') || roles.includes('supervisor') ||
                  roles.includes('site_worker') || roles.includes('project_engineer')) {
                return <Navigate to="/my-projects" replace />
              }
              if (roles.includes('estimation_engineer') || roles.includes('sales_engineer')) {
                return <Navigate to="/estimations-dashboard" replace />
              }
              if (roles.includes('inventory_manager') || roles.includes('store_keeper')) {
                return <Navigate to="/inventory-dashboard" replace />
              }
              if (roles.includes('procurement_engineer')) {
                return <Navigate to="/procurement-dashboard" replace />
              }
            }
            return <MainDashboard />
          })()}

          {activeTab === 'my-projects' && <MyProjects />}
          
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'estimations-dashboard' && <EstimationsDashboard />}
          {activeTab === 'inventory-dashboard' && <InventoryDashboard />}
          {activeTab === 'procurement-dashboard' && <ProcurementDashboard />}
          {activeTab === 'leads' && <LeadManagement />}
          {activeTab === 'projects' && <ProjectManagement />}
          {activeTab === 'quotations' && <QuotationManagement />}
          {activeTab === 'revisions' && <RevisionManagement />}
          {activeTab === 'project-variations' && <ProjectVariationManagement />}
          {activeTab === 'audit-logs' && <UnifiedAuditLogs />}
          {activeTab === 'inventory' && <InventoryManagement />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'my-attendance' && <MyAttendance />}
          {activeTab === 'material-requests' && <MaterialRequestManagement />}
          {activeTab === 'purchase-requests' && <PurchaseRequestManagement />}
          {activeTab === 'purchase-orders' && <PurchaseOrderManagement />}
          {activeTab === 'suppliers' && <SupplierManagement />}
          {activeTab === 'company' && (() => {
            const pathSegments = location.pathname.split('/').filter(Boolean);
            const subPath = pathSegments[1] || '';
            return (
              <>
                {!subPath && <CompanyManagement />}
                {subPath === 'profile' && <CompanyProfile />}
                {subPath === 'documents' && <DocumentManagement />}
                {subPath === 'credentials' && <CredentialManagement />}
                {subPath === 'vehicles' && <VehicleManagement />}
              </>
            );
          })()}
          {activeTab === 'hr' && (() => {
            const pathSegments = location.pathname.split('/').filter(Boolean);
            const subPath = pathSegments[1] || '';
            return (
              <>
                {!subPath && <HRDashboard />}
                {subPath === 'employees' && <EmployeeManagement />}
                {subPath === 'attendance' && <AttendanceManagement />}
                {subPath === 'leave' && <LeaveManagement />}
                {subPath === 'offboarding' && <OffboardingManagement />}
                {subPath === 'locations' && <LocationManagement />}
                {subPath === 'location-groups' && <LocationGroupManagement />}
                {subPath === 'holidays' && <HolidayManagement />}
              </>
            );
          })()}
          {activeTab === 'accounts' && (() => {
            const pathSegments = location.pathname.split('/').filter(Boolean);
            const subPath = pathSegments[1] || '';
            return (
              <>
                {!subPath && <AccountsDashboard />}
                {subPath === 'chart' && <ChartOfAccountsManagement />}
                {subPath === 'journals' && <JournalEntryManagement />}
                {subPath === 'bills' && <SupplierBillManagement />}
                {subPath === 'claims' && <SalesClaimManagement />}
                {subPath === 'salary-preparation' && <SalaryPreparationManagement />}
                {subPath === 'tally-sync' && <TallySyncQueue />}
                {subPath === 'vat-report' && <VATReport />}
                {subPath === 'tally-setup' && <TallySetup />}
                {subPath === 'settings' && <AccountsSettings />}
              </>
            );
          })()}
        </div>
      </div>
      
      {/* Modal Routes - render on top of main content when background location exists */}
      {isModalRoute && (
        <Routes location={location}>
          <Route path="/leads/create-quotation/:leadId" element={<QuotationModal />} />
        </Routes>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay" onClick={() => setShowLogoutModal(false)} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Confirm Logout</h2>
              <button onClick={() => setShowLogoutModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to logout?</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowLogoutModal(false)}>
                  Cancel
                </button>
                <button type="button" className="reject-btn" onClick={confirmLogout}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard