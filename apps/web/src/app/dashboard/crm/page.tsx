'use client';
export const dynamic = 'force-dynamic';

// Force dynamic rendering to avoid SSG issues with useSearchParams
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { crmApi } from '@/lib/api';
import { formatNGN, formatTimeAgo } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  RefreshCw, Plug, Unplug, CheckCircle, XCircle, Clock,
  AlertTriangle, Settings, ArrowLeftRight, ArrowUp, ArrowDown,
  Users, Briefcase, Zap, Lock, ChevronRight, Loader2,
  BarChart2, Activity, Link2,
} from 'lucide-react';

// ─── PROVIDER CONFIG ───────────────────────────────────
const PROVIDERS = {
  SALESFORCE: {
    name: 'Salesforce',
    logo: '☁️',
    color: '#00A1E0',
    bg: '#E8F4FB',
    description: 'Sync attendees as Contacts, bookings as Opportunities. Full CRM pipeline tracking.',
    features: ['Contact upsert by email', 'Opportunity tracking', 'Custom field mapping', 'Bidirectional sync'],
    docsUrl: 'https://developer.salesforce.com/docs',
  },
  HUBSPOT: {
    name: 'HubSpot',
    logo: '🔶',
    color: '#FF7A59',
    bg: '#FFF3F0',
    description: 'Push attendees as Contacts, bookings as Deals. Track your event pipeline end-to-end.',
    features: ['Contact lifecycle sync', 'Deal pipeline tracking', 'Pipeline & stage config', 'Auto-sync every 6h'],
    docsUrl: 'https://developers.hubspot.com',
  },
};

const STATUS_CONFIG = {
  IDLE:     { label: 'Idle',     color: '#8B82A0', icon: Clock },
  SYNCING:  { label: 'Syncing…', color: '#3B82F6', icon: RefreshCw },
  SUCCESS:  { label: 'Success',  color: '#059669', icon: CheckCircle },
  FAILED:   { label: 'Failed',   color: '#DC2626', icon: XCircle },
  PARTIAL:  { label: 'Partial',  color: '#D97706', icon: AlertTriangle },
};

const DIRECTION_CONFIG = {
  PUSH:          { label: 'Push only',         icon: ArrowUp,          desc: 'Owambe → CRM' },
  PULL:          { label: 'Pull only',          icon: ArrowDown,        desc: 'CRM → Owambe' },
  BIDIRECTIONAL: { label: 'Bidirectional',      icon: ArrowLeftRight,   desc: 'Two-way sync' },
};

const DEFAULT_FIELD_MAPS = {
  SALESFORCE: {
    firstName: 'FirstName', lastName: 'LastName', email: 'Email',
    phone: 'Phone', company: 'Company',
    owambeAttendeeId: 'Owambe_Attendee_ID__c',
    owambeEventName: 'Owambe_Event_Name__c',
    owambeTicketType: 'Owambe_Ticket_Type__c',
    owambeAmountPaid: 'Owambe_Amount_Paid__c',
  },
  HUBSPOT: {
    firstName: 'firstname', lastName: 'lastname', email: 'email',
    phone: 'phone', company: 'company',
    owambeAttendeeId: 'owambe_attendee_id',
    owambeEventName: 'owambe_event_name',
    owambeTicketType: 'owambe_ticket_type',
    owambeAmountPaid: 'owambe_amount_paid',
  },
};

const OWAMBE_FIELDS = [
  { key: 'firstName', label: 'First Name', type: 'text' },
  { key: 'lastName', label: 'Last Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'owambeAttendeeId', label: 'Attendee ID', type: 'id' },
  { key: 'owambeEventName', label: 'Event Name', type: 'text' },
  { key: 'owambeTicketType', label: 'Ticket Type', type: 'text' },
  { key: 'owambeAmountPaid', label: 'Amount Paid (₦)', type: 'number' },
];

// ─── SUBCOMPONENTS ─────────────────────────────────────
function ProviderCard({ provider, connection, onConnect, onSync, onDisconnect }: {
  provider: 'SALESFORCE' | 'HUBSPOT';
  connection?: any;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const cfg = PROVIDERS[provider];
  const isConnected = !!connection;
  const statusCfg = isConnected ? (STATUS_CONFIG[connection.lastSyncStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.IDLE) : null;
  const StatusIcon = statusCfg?.icon || Clock;

  return (
    <div className="card overflow-hidden">
      {/* Header strip */}
      <div style={{ background: cfg.bg, borderBottom: '1px solid var(--border)' }}
        className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{cfg.logo}</span>
          <div>
            <div className="font-bold text-sm">{cfg.name}</div>
            <div className="text-xs text-[var(--muted)]">CRM Integration</div>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-green-600">Connected</span>
          </div>
        ) : (
          <span className="text-xs font-bold text-[var(--muted)] bg-[var(--border)] px-2.5 py-1 rounded-full">
            Not connected
          </span>
        )}
      </div>

      <div className="p-5">
        {!isConnected ? (
          <>
            <p className="text-sm text-[var(--muted)] mb-4 leading-relaxed">{cfg.description}</p>
            <div className="space-y-1.5 mb-5">
              {cfg.features.map(f => (
                <div key={f} className="flex items-center gap-2 text-xs text-[var(--mid)]">
                  <CheckCircle size={11} className="text-[var(--accent)] flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <button onClick={onConnect}
              className="btn-primary w-full justify-center text-sm"
              style={{ background: cfg.color }}>
              <Plug size={13} /> Connect {cfg.name}
            </button>
          </>
        ) : (
          <>
            {/* Sync stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[var(--bg)] rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[var(--dark)]">{connection.totalSynced}</div>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Synced</div>
              </div>
              <div className="bg-[var(--bg)] rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-[connection.totalErrors > 0 ? 'var(--danger)' : 'var(--dark)']"
                  style={{ color: connection.totalErrors > 0 ? 'var(--danger)' : undefined }}>
                  {connection.totalErrors}
                </div>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Errors</div>
              </div>
              <div className="bg-[var(--bg)] rounded-lg p-3 text-center">
                <div className="text-xs font-bold" style={{ color: statusCfg?.color }}>
                  <StatusIcon size={14} className="mx-auto mb-0.5" />
                  {statusCfg?.label}
                </div>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide mt-0.5">Status</div>
              </div>
            </div>

            {/* Last sync */}
            <div className="text-xs text-[var(--muted)] mb-4">
              {connection.lastSyncAt
                ? `Last sync: ${formatTimeAgo(connection.lastSyncAt)}`
                : 'Never synced — trigger a manual sync'}
              {connection.portalId && <span className="ml-2">· Portal: {connection.portalId}</span>}
              {connection.instanceUrl && <span className="ml-2 truncate">· {connection.instanceUrl.replace('https://', '')}</span>}
            </div>

            {/* Direction badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-[var(--muted)]">Sync:</span>
              {(() => {
                const dc = DIRECTION_CONFIG[connection.syncDirection as keyof typeof DIRECTION_CONFIG];
                return (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] bg-[var(--pill)] px-2 py-0.5 rounded-full">
                    <dc.icon size={10} /> {dc.label}
                  </span>
                );
              })()}
              <span className="text-xs text-[var(--muted)]">
                {connection.autoSyncEnabled ? `Auto every ${connection.syncIntervalHours}h` : 'Manual only'}
              </span>
            </div>

            {connection.lastSyncError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
                ⚠️ {connection.lastSyncError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onSync}
                className="btn-primary flex-1 justify-center text-xs"
                style={{ background: cfg.color }}>
                <RefreshCw size={12} /> Sync Now
              </button>
              <button onClick={onDisconnect}
                className="btn-secondary text-xs px-3 text-red-500 border-red-200 hover:bg-red-50">
                <Unplug size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldMapper({ connection, onSave }: { connection: any; onSave: (map: Record<string, string>) => void }) {
  const provider = connection.provider as 'SALESFORCE' | 'HUBSPOT';
  const defaults = DEFAULT_FIELD_MAPS[provider];
  const [map, setMap] = useState<Record<string, string>>(
    (connection.attendeeFieldMap as Record<string, string>) || defaults
  );

  const crmLabel = provider === 'SALESFORCE' ? 'Salesforce field (API name)' : 'HubSpot property';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-sm">Attendee → Contact Field Mapping</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Map Owambe attendee fields to {PROVIDERS[provider].name} {provider === 'SALESFORCE' ? 'Contact' : 'Contact'} properties
          </p>
        </div>
        <button onClick={() => onSave(map)} className="btn-primary text-xs px-3 py-1.5">
          Save Mapping
        </button>
      </div>

      <div className="grid grid-cols-[18px_1fr_32px_1fr] gap-x-3 gap-y-2 items-center">
        <div /> <div className="label">Owambe Field</div>
        <div /> <div className="label">{crmLabel}</div>

        {OWAMBE_FIELDS.map(field => (
          <>
            <div key={`icon-${field.key}`}
              className="w-4 h-4 rounded-full bg-[var(--pill)] flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--pill)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            </div>
            <div key={`owambe-${field.key}`}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--mid)]">
              {field.label}
            </div>
            <div key={`arrow-${field.key}`} className="text-center">
              <ArrowLeftRight size={12} className="text-[var(--muted)] mx-auto" />
            </div>
            <input
              key={`input-${field.key}`}
              className="input text-xs font-mono py-1.5"
              value={map[field.key] || ''}
              onChange={e => setMap(m => ({ ...m, [field.key]: e.target.value }))}
              placeholder={defaults[field.key as keyof typeof defaults] || ''}
            />
          </>
        ))}
      </div>

      <div className="mt-4 p-3 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          {provider === 'SALESFORCE'
            ? 'Custom fields must exist in Salesforce (e.g. Owambe_Attendee_ID__c). Create them in Setup → Object Manager → Contact → Fields & Relationships.'
            : 'Custom properties must be created in HubSpot first: Settings → Properties → Create property. Property names are lowercase with underscores.'}
        </p>
      </div>
    </div>
  );
}

function SyncLogs({ connectionId }: { connectionId: string }) {
  const { data } = useQuery({
    queryKey: ['crm-logs', connectionId],
    queryFn: () => crmApi.logs(connectionId, { limit: 30 }).then(r => r.data),
    refetchInterval: 5000,
  });

  const logs = data?.logs || [];

  return (
    <div className="card overflow-hidden p-0">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-sm font-bold">Sync Activity</span>
        <span className="text-xs text-[var(--muted)]">{data?.total ?? 0} total events</span>
      </div>
      {logs.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--muted)]">
          No sync activity yet — trigger a sync to see logs
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
          {logs.map((log: any) => {
            const isSuccess = log.status === 'SUCCESS';
            const isFailed = log.status === 'FAILED';
            return (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                {isSuccess
                  ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                  : isFailed
                    ? <XCircle size={13} className="text-red-500 flex-shrink-0" />
                    : <AlertTriangle size={13} className="text-yellow-500 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium capitalize">{log.entityType}</span>
                    <span className="text-[10px] font-mono text-[var(--muted)] truncate">{log.crmId || log.entityId?.slice(0, 8)}</span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {log.direction === 'PUSH' ? '→' : '←'} {log.direction}
                    </span>
                  </div>
                  {log.errorMessage && (
                    <div className="text-[10px] text-red-500 truncate">{log.errorMessage}</div>
                  )}
                </div>
                <div className="text-[10px] text-[var(--muted)] flex-shrink-0">
                  {log.durationMs ? `${log.durationMs}ms` : ''}
                </div>
                <div className="text-[10px] text-[var(--muted)] flex-shrink-0 w-20 text-right">
                  {formatTimeAgo(log.syncedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────
export default function CrmSyncPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [showFieldMapper, setShowFieldMapper] = useState(false);
  const [settingsConn, setSettingsConn] = useState<any>(null);

  // Toast connection success from OAuth redirect
  const justConnected = searchParams.get('connected');
  if (justConnected && typeof window !== 'undefined') {
    toast.success(`✅ ${justConnected} connected successfully!`);
    window.history.replaceState({}, '', window.location.pathname);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['crm-connections'],
    queryFn: () => crmApi.list().then(r => r.data),
    retry: false,
  });

  const connections: any[] = data?.connections || [];
  const sfConn = connections.find(c => c.provider === 'SALESFORCE');
  const hsConn = connections.find(c => c.provider === 'HUBSPOT');

  const syncMutation = useMutation({
    mutationFn: (id: string) => crmApi.sync(id),
    onSuccess: () => {
      toast.success('Sync started! Check logs for progress.');
      queryClient.invalidateQueries({ queryKey: ['crm-connections'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Sync failed'),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => crmApi.disconnect(id),
    onSuccess: () => {
      toast.success('CRM disconnected');
      queryClient.invalidateQueries({ queryKey: ['crm-connections'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => crmApi.update(id, data),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['crm-connections'] });
    },
  });

  const saveFieldMap = (connId: string, map: Record<string, string>) => {
    updateMutation.mutate({ id: connId, data: { attendeeFieldMap: map } });
  };

  async function handleConnect(provider: string) {
    try {
      const res = await crmApi.getOAuthUrl(provider);
      // Open OAuth flow
      window.location.href = res.data.url;
    } catch (err: any) {
      const msg = err.response?.data?.error || '';
      if (msg.includes('not configured')) {
        // Show manual connection modal
        toast.error(`${provider} OAuth not configured. Use manual token entry.`);
        // For demo: show manual connect
        const token = prompt(`Enter your ${provider} access token:`);
        const instanceUrl = provider === 'SALESFORCE' ? prompt('Enter your Salesforce instance URL (e.g. https://myorg.my.salesforce.com):') : undefined;
        if (token) {
          await crmApi.connect({ provider, accessToken: token, instanceUrl: instanceUrl || undefined });
          queryClient.invalidateQueries({ queryKey: ['crm-connections'] });
          toast.success(`${provider} connected!`);
        }
      } else {
        toast.error(msg || 'Connection failed');
      }
    }
  }

  // Total synced across all connections
  const totalSynced = connections.reduce((s, c) => s + (c.totalSynced || 0), 0);
  const totalErrors = connections.reduce((s, c) => s + (c.totalErrors || 0), 0);
  const activeConns = connections.filter(c => c.isActive).length;

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  // Scale gate — show upgrade prompt if API returns 403
  if (data === undefined && !isLoading) {
    return (
      <div className="p-6 animate-fade-up">
        <div className="card text-center py-14 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[var(--pill-t)] flex items-center justify-center mx-auto mb-4">
            <Link2 size={28} className="text-[var(--accent2)]" />
          </div>
          <h2 className="font-bold text-xl mb-2">CRM Integration</h2>
          <p className="text-sm text-[var(--muted)] mb-6 max-w-sm mx-auto leading-relaxed">
            Sync your attendees and bookings directly to Salesforce or HubSpot — automatic two-way sync, deal tracking, and field mapping. Scale plan required.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-8 text-left">
            {[
              { icon: '☁️', title: 'Salesforce', desc: 'Contacts + Opportunities' },
              { icon: '🔶', title: 'HubSpot', desc: 'Contacts + Deals' },
              { icon: '🔄', title: 'Two-way sync', desc: 'Owambe ↔ CRM' },
              { icon: '🗂️', title: 'Field mapping', desc: 'Custom field config' },
            ].map(f => (
              <div key={f.title} className="bg-[var(--bg)] rounded-xl p-3 border border-[var(--border)]">
                <div className="text-xl mb-1.5">{f.icon}</div>
                <div className="font-semibold text-xs">{f.title}</div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>
          <a href="/dashboard/pricing" className="btn-accent text-sm px-8 py-3 inline-flex items-center gap-2">
            <Zap size={15} /> Upgrade to Scale
          </a>
          <p className="text-xs text-[var(--muted)] mt-3">₦450,000/month · includes white-label + CRM</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Link2 size={18} className="text-[var(--accent)]" /> CRM Sync
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Two-way sync between Owambe and your CRM · Scale plan
          </p>
        </div>
        {connections.length > 0 && (
          <button
            onClick={() => connections.forEach(c => syncMutation.mutate(c.id))}
            disabled={syncMutation.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5">
            {syncMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sync All
          </button>
        )}
      </div>

      {/* Stats */}
      {connections.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Connections', value: `${activeConns}/2`, color: '#6C2BD9', icon: <Plug size={14} className="text-[var(--accent)]" /> },
            { label: 'Total Synced', value: totalSynced, color: '#6C2BD9', icon: <Users size={14} className="text-[var(--accent)]" /> },
            { label: 'Sync Errors', value: totalErrors, color: totalErrors > 0 ? '#DC2626' : '#8B82A0', icon: <AlertTriangle size={14} style={{ color: totalErrors > 0 ? '#DC2626' : '#8B82A0' }} /> },
            { label: 'Auto-sync', value: connections.filter(c => c.autoSyncEnabled).length > 0 ? 'Active' : 'Off', color: '#6C2BD9', icon: <Zap size={14} className="text-[var(--accent)]" /> },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.color }} />
              <div className="flex items-center justify-between mb-1.5">
                <div className="stat-label">{s.label}</div>
                {s.icon}
              </div>
              <div className="stat-number" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Provider cards */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {(['SALESFORCE', 'HUBSPOT'] as const).map(provider => (
          <ProviderCard
            key={provider}
            provider={provider}
            connection={provider === 'SALESFORCE' ? sfConn : hsConn}
            onConnect={() => handleConnect(provider)}
            onSync={() => {
              const conn = provider === 'SALESFORCE' ? sfConn : hsConn;
              if (conn) syncMutation.mutate(conn.id);
            }}
            onDisconnect={() => {
              const conn = provider === 'SALESFORCE' ? sfConn : hsConn;
              if (conn && confirm(`Disconnect ${PROVIDERS[provider].name}? Sync logs will be deleted.`)) {
                disconnectMutation.mutate(conn.id);
              }
            }}
          />
        ))}
      </div>

      {/* Settings + Field Mapping for each connection */}
      {connections.map(conn => (
        <div key={conn.id} className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm text-[var(--dark)] flex items-center gap-2">
              <span>{PROVIDERS[conn.provider as keyof typeof PROVIDERS]?.logo}</span>
              {PROVIDERS[conn.provider as keyof typeof PROVIDERS]?.name} Settings
            </h2>
            <button
              onClick={() => setShowFieldMapper(v => !v)}
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <Settings size={11} /> Field Mapping
            </button>
          </div>

          {/* Sync settings */}
          <div className="card p-5 mb-3">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="label">Sync direction</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.entries(DIRECTION_CONFIG) as [string, typeof DIRECTION_CONFIG[keyof typeof DIRECTION_CONFIG]][]).map(([key, dc]) => (
                    <button key={key}
                      onClick={() => updateMutation.mutate({ id: conn.id, data: { syncDirection: key } })}
                      className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition-all flex flex-col items-center gap-1 ${
                        conn.syncDirection === key
                          ? 'bg-[var(--dark)] text-white border-[var(--dark)]'
                          : 'bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--dark)]'
                      }`}>
                      <dc.icon size={12} />
                      {dc.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">What to sync</label>
                <div className="space-y-2">
                  {[
                    { key: 'syncAttendees', label: 'Attendees → Contacts', icon: Users },
                    { key: 'syncBookings',  label: 'Bookings → Deals',    icon: Briefcase },
                    { key: 'syncContacts',  label: 'Contacts ← CRM',      icon: ArrowDown },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => updateMutation.mutate({ id: conn.id, data: { [item.key]: !conn[item.key] } })}
                        className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${conn[item.key] ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${conn[item.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <item.icon size={12} className="text-[var(--muted)]" />
                      <span className="text-xs text-[var(--mid)]">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Auto-sync</label>
                <div className="flex items-center gap-3">
                  <div
                    onClick={() => updateMutation.mutate({ id: conn.id, data: { autoSyncEnabled: !conn.autoSyncEnabled } })}
                    className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${conn.autoSyncEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${conn.autoSyncEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-xs text-[var(--mid)]">
                    {conn.autoSyncEnabled ? `Every ${conn.syncIntervalHours}h` : 'Manual only'}
                  </span>
                </div>
              </div>
              <div>
                <label className="label">Sync interval (hours)</label>
                <select className="input text-sm py-1.5"
                  value={conn.syncIntervalHours}
                  onChange={e => updateMutation.mutate({ id: conn.id, data: { syncIntervalHours: Number(e.target.value) } })}>
                  {[1, 2, 4, 6, 12, 24].map(h => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Field mapper */}
          {showFieldMapper && (
            <FieldMapper connection={conn} onSave={map => saveFieldMap(conn.id, map)} />
          )}

          {/* Sync logs */}
          <div className="mt-3">
            <SyncLogs connectionId={conn.id} />
          </div>
        </div>
      ))}

      {/* Empty state */}
      {connections.length === 0 && (
        <div className="card text-center py-10 mt-2">
          <Activity size={32} className="mx-auto mb-3 text-[var(--border)]" />
          <div className="font-bold text-sm mb-1">Connect your first CRM</div>
          <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
            Once connected, Owambe will automatically push attendees as contacts and bookings as deals.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="card p-5 mt-4 bg-[var(--pill)]">
        <h3 className="font-bold text-sm mb-3">How it works</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Connect', desc: 'OAuth or API token. Takes 30 seconds.', icon: Plug },
            { step: '2', title: 'Configure', desc: 'Set sync direction, map fields to your CRM schema.', icon: Settings },
            { step: '3', title: 'Auto-sync', desc: 'Runs every 1–24h. Attendees become contacts, bookings become deals.', icon: RefreshCw },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {s.step}
              </div>
              <div>
                <div className="font-semibold text-sm mb-0.5">{s.title}</div>
                <div className="text-xs text-[var(--muted)] leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
