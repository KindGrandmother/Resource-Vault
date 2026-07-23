import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Briefcase,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Globe2,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type {
  DashboardData,
  FullResource,
  LinkedInEducation,
  LinkedInEmployment,
  ResourceDetails,
  ResourceListItem,
  ResourcePayload,
  ResourceStatus,
  ResourceType,
} from './types';

const typeMeta: Record<ResourceType, { label: string; icon: typeof Globe2 }> = {
  proxy: { label: 'Proxies', icon: Globe2 },
  gift_card: { label: 'Gift Cards', icon: CreditCard },
  slynumber: { label: 'SlyNumbers', icon: Phone },
  google_voice: { label: 'Google Voice', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  linkedin_account: { label: 'LinkedIn Accounts', icon: UserRound },
};

const emptyEmployment = (): LinkedInEmployment => ({
  jobTitle: '',
  company: '',
  employmentType: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
});

const emptyEducation = (): LinkedInEducation => ({
  school: '',
  degree: '',
  startYear: '',
  endYear: '',
  location: '',
});

const emptyPayload = (type: ResourceType = 'proxy'): ResourcePayload => ({
  type,
  label: '',
  status: 'active',
  expiresAt: '',
  notes: '',
  details: type === 'linkedin_account'
    ? {
        employmentHistory: [emptyEmployment()],
        education: [emptyEducation()],
      }
    : {},
});

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'No expiration';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}

function formatMonth(value: string) {
  if (!value) return '';
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86_400_000);
}

function statusForDate(status: ResourceStatus, expiresAt?: string | null) {
  const days = daysUntil(expiresAt);
  if (days !== null && days < 0) return 'expired';
  return status;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeEmployment(value: unknown): LinkedInEmployment[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const item = toRecord(entry);
    return {
      jobTitle: String(item.jobTitle || ''),
      company: String(item.company || ''),
      employmentType: String(item.employmentType || ''),
      startDate: String(item.startDate || ''),
      endDate: String(item.endDate || ''),
      isCurrent: Boolean(item.isCurrent),
    };
  });
}

function normalizeEducation(value: unknown): LinkedInEducation[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const item = toRecord(entry);
    return {
      school: String(item.school || ''),
      degree: String(item.degree || ''),
      startYear: String(item.startYear || ''),
      endYear: String(item.endYear || ''),
      location: String(item.location || ''),
    };
  });
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [resources, setResources] = useState<ResourceListItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ResourceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FullResource | null>(null);
  const [revealed, setRevealed] = useState<FullResource | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [dashboardData, resourceData] = await Promise.all([
        window.resourceAPI.getDashboard(),
        window.resourceAPI.listResources({
          type: typeFilter,
          status: statusFilter,
          search,
        }),
      ]);

      setDashboard(dashboardData);
      setResources(resourceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load resources.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load]);

  async function openEdit(id: string) {
    setMenuId(null);
    const item = await window.resourceAPI.getResource(id);
    setEditing(item);
    setModalOpen(true);
  }

  async function toggleReveal(id: string) {
    if (revealed?.id === id) {
      setRevealed(null);
      return;
    }

    const item = await window.resourceAPI.getResource(id);
    setRevealed(item);

    window.setTimeout(() => {
      setRevealed((current) => (current?.id === id ? null : current));
    }, 10_000);
  }

  async function deleteItem(id: string) {
    setMenuId(null);
    if (!window.confirm('Delete this resource permanently?')) return;

    await window.resourceAPI.deleteResource(id);
    if (revealed?.id === id) setRevealed(null);
    await load();
  }

  const selectedLabel = typeFilter ? typeMeta[typeFilter].label : 'All Resources';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div>
            <strong>Resource Vault</strong>
            <span>Private workspace</span>
          </div>
        </div>

        <nav className="nav-stack">
          <button
            className={!typeFilter ? 'nav-item active' : 'nav-item'}
            onClick={() => setTypeFilter('')}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
            <b>{dashboard?.total ?? 0}</b>
          </button>

          <div className="nav-label">Resource groups</div>

          {(Object.keys(typeMeta) as ResourceType[]).map((type) => {
            const Icon = typeMeta[type].icon;
            return (
              <button
                key={type}
                className={typeFilter === type ? 'nav-item active' : 'nav-item'}
                onClick={() => setTypeFilter(type)}
              >
                <Icon size={18} />
                <span>{typeMeta[type].label}</span>
                <b>{dashboard?.byType[type] ?? 0}</b>
              </button>
            );
          })}
        </nav>

        <div className="security-card">
          <div className="security-icon"><ShieldCheck size={20} /></div>
          <strong>Local & encrypted</strong>
          <p>Secrets are encrypted with your operating system account and never sent to a server.</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">RESOURCE OPERATIONS</div>
            <h1>{selectedLabel}</h1>
            <p>Track ownership, balances, credentials and expiration dates from one place.</p>
          </div>

          <button
            className="primary-button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={18} /> Add resource
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <section className="stats-grid">
          <StatCard
            label="Total resources"
            value={String(dashboard?.total ?? 0)}
            icon={Archive}
            hint="Across every category"
          />
          <StatCard
            label="Active"
            value={String(dashboard?.active ?? 0)}
            icon={ShieldCheck}
            hint="Ready to use"
          />
          <StatCard
            label="Expiring soon"
            value={String(dashboard?.expiring30 ?? 0)}
            icon={CalendarClock}
            hint="Within 30 days"
            warning={(dashboard?.expiring30 ?? 0) > 0}
          />
          <StatCard
            label="Gift card balance"
            value={formatMoney(dashboard?.giftBalanceCents ?? 0)}
            icon={CircleDollarSign}
            hint="Current recorded balance"
          />
        </section>

        <section className="dashboard-grid">
          <div className="panel resource-panel">
            <div className="panel-header">
              <div>
                <h2>Resource inventory</h2>
                <p>{resources.length} matching record{resources.length === 1 ? '' : 's'}</p>
              </div>
              <button className="icon-button" onClick={load} aria-label="Refresh">
                <RefreshCw size={17} className={loading ? 'spin' : ''} />
              </button>
            </div>

            <div className="toolbar">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search label, IP, email, name, company..."
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(
                  event.target.value as ResourceStatus | 'all',
                )}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Expiration</th>
                    <th>Secret</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {!loading && resources.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-icon"><Archive size={24} /></div>
                          <h3>No resources found</h3>
                          <p>Add your first resource or adjust the filters.</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {resources.map((item) => {
                    const meta = typeMeta[item.type];
                    const Icon = meta.icon;
                    const computedStatus = statusForDate(item.status, item.expiresAt);
                    const isRevealed = revealed?.id === item.id;

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="resource-name">
                            <div className={`resource-icon ${item.type}`}>
                              <Icon size={18} />
                            </div>
                            <div>
                              <strong>{item.label}</strong>
                              <span>{meta.label}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className="muted-detail">{item.summary || '—'}</span></td>
                        <td>
                          <span className={`status-pill ${computedStatus}`}>
                            {computedStatus}
                          </span>
                        </td>
                        <td><ExpirationCell value={item.expiresAt} /></td>
                        <td>
                          <button
                            className="reveal-button"
                            onClick={() => toggleReveal(item.id)}
                          >
                            {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                            {isRevealed ? 'Hide' : 'Reveal'}
                          </button>
                        </td>
                        <td className="action-cell">
                          <button
                            className="icon-button small"
                            onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                          >
                            <MoreHorizontal size={17} />
                          </button>

                          {menuId === item.id && (
                            <div className="action-menu">
                              <button onClick={() => openEdit(item.id)}>
                                <Pencil size={15} /> Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => deleteItem(item.id)}
                              >
                                <Trash2 size={15} /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="right-column">
            <div className="panel upcoming-panel">
              <div className="panel-header compact">
                <div>
                  <h2>Upcoming expirations</h2>
                  <p>Next renewals to review</p>
                </div>
              </div>

              <div className="upcoming-list">
                {(dashboard?.upcoming ?? []).length === 0 && (
                  <p className="quiet">No dated resources yet.</p>
                )}

                {(dashboard?.upcoming ?? []).map((item) => {
                  const days = daysUntil(item.expiresAt);
                  return (
                    <button
                      key={item.id}
                      onClick={() => openEdit(item.id)}
                      className="upcoming-item"
                    >
                      <div className="date-chip">
                        <span>
                          {new Date(`${item.expiresAt}T00:00:00`).toLocaleString(
                            'en-US',
                            { month: 'short' },
                          )}
                        </span>
                        <strong>
                          {new Date(`${item.expiresAt}T00:00:00`).getDate()}
                        </strong>
                      </div>
                      <div>
                        <strong>{item.label}</strong>
                        <span>
                          {days === 0
                            ? 'Expires today'
                            : `${days} day${days === 1 ? '' : 's'} remaining`}
                        </span>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </div>

            <SecretPanel resource={revealed} onClose={() => setRevealed(null)} />
          </aside>
        </section>
      </main>

      {modalOpen && (
        <ResourceModal
          initial={editing}
          defaultType={typeFilter || 'proxy'}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setModalOpen(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  warning = false,
}: {
  label: string;
  value: string;
  icon: typeof Archive;
  hint: string;
  warning?: boolean;
}) {
  return (
    <div className={`stat-card ${warning ? 'warning' : ''}`}>
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon"><Icon size={19} /></div>
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function ExpirationCell({ value }: { value?: string | null }) {
  const days = daysUntil(value);
  if (!value) return <span className="quiet">No expiration</span>;

  return (
    <div className="expiration-cell">
      <strong>{formatDate(value)}</strong>
      <span className={days !== null && days <= 14 ? 'urgent' : ''}>
        {days !== null && days < 0
          ? `${Math.abs(days)} days ago`
          : `${days} days left`}
      </span>
    </div>
  );
}

function SecretPanel({
  resource,
  onClose,
}: {
  resource: FullResource | null;
  onClose: () => void;
}) {
  const entries = useMemo<Array<[string, unknown]>>(() => {
    if (!resource) return [];
    const d = resource.details;

    if (resource.type === 'proxy') {
      return [
        ['IP address', d.ipAddress],
        ['Port', d.port],
        ['Username', d.username],
        ['Password', d.password],
        ['Order number', d.orderNumber],
      ];
    }

    if (resource.type === 'gift_card') {
      return [
        ['Card number', d.cardNumber],
        ['UID', d.uid],
        ['Deposit', formatMoney(Number(d.depositAmountCents || 0))],
        ['Current', formatMoney(Number(d.currentAmountCents || 0))],
      ];
    }

    if (resource.type === 'linkedin_account') {
      const employment = normalizeEmployment(d.employmentHistory);
      const education = normalizeEducation(d.education);
      const fullName = [d.firstName, d.lastName].filter(Boolean).join(' ');
      const cityStateZip = [
        d.city,
        [d.state, d.zipCode].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ');
      const fullAddress = [d.streetAddress, cityStateZip].filter(Boolean).join('\n');
      const driverLicense = [d.driverLicense, d.driverLicenseState]
        .filter(Boolean)
        .join(' ');
      const employmentText = employment
        .map((item) => {
          const dates = [
            formatMonth(item.startDate),
            item.isCurrent ? 'Present' : formatMonth(item.endDate),
          ].filter(Boolean).join(' – ');
          const companyLine = [item.company, item.employmentType]
            .filter(Boolean)
            .join(' • ');
          return [item.jobTitle, dates, companyLine].filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
      const educationText = education
        .map((item) => {
          const years = [item.startYear, item.endYear].filter(Boolean).join(' – ');
          return [item.school, item.degree, years, item.location]
            .filter(Boolean)
            .join('\n');
        })
        .filter(Boolean)
        .join('\n\n');

      return [
        ['Name', fullName],
        ['Date of birth', d.dob],
        ['Address', fullAddress],
        ['County', d.county],
        ['SSN', d.ssn],
        ['Driver license', driverLicense],
        ['LinkedIn URL', d.linkedinUrl],
        ['Email', d.email],
        ['Password', d.password],
        ['Employment history', employmentText],
        ['Education', educationText],
      ];
    }

    return [
      ['Phone number', d.phoneNumber],
      ['Related email', d.relatedEmail],
      ['Contact name', d.contactName],
      ['Used services', d.usedServices],
    ];
  }, [resource]);

  async function copyValue(value: unknown) {
    if (value !== null && value !== undefined) {
      await window.resourceAPI.copyText(String(value));
    }
  }

  return (
    <div className="panel secret-panel">
      <div className="panel-header compact">
        <div>
          <h2>Secure reveal</h2>
          <p>
            {resource
              ? 'Automatically hides after 10 seconds'
              : 'Select Reveal on a record'}
          </p>
        </div>
        {resource && (
          <button className="icon-button small" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      {!resource ? (
        <div className="secret-placeholder">
          <Eye size={24} />
          <p>Sensitive values remain hidden until you explicitly reveal them.</p>
        </div>
      ) : (
        <div className="secret-content">
          <div className="secret-title">
            <span>{typeMeta[resource.type].label}</span>
            <strong>{resource.label}</strong>
          </div>

          {entries
            .filter(([, value]) => value !== '' && value !== null && value !== undefined)
            .map(([label, value]) => (
              <div className="secret-row" key={String(label)}>
                <div>
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </div>
                <button
                  onClick={() => copyValue(value)}
                  aria-label={`Copy ${label}`}
                >
                  <Copy size={15} />
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ResourceModal({
  initial,
  defaultType,
  onClose,
  onSaved,
}: {
  initial: FullResource | null;
  defaultType: ResourceType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ResourcePayload>(() => {
    if (!initial) return emptyPayload(defaultType);

    const details: ResourceDetails = { ...initial.details };
    if (initial.type === 'gift_card') {
      details.depositAmount = Number(initial.details.depositAmountCents || 0) / 100;
      details.currentAmount = Number(initial.details.currentAmountCents || 0) / 100;
    }

    return {
      id: initial.id,
      type: initial.type,
      label: initial.label,
      status: initial.status,
      expiresAt: initial.expiresAt || '',
      notes: initial.notes,
      details,
    };
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function updateRoot<K extends keyof ResourcePayload>(
    key: K,
    value: ResourcePayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDetail(key: string, value: unknown) {
    setForm((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await window.resourceAPI.saveResource(form);
      await onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save resource.');
    } finally {
      setSaving(false);
    }
  }

  const showExpiration = ![
    'google_voice',
    'whatsapp',
    'linkedin_account',
  ].includes(form.type);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className={form.type === 'linkedin_account' ? 'modal modal-wide' : 'modal'}
        onSubmit={submit}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">
              {initial ? 'EDIT RESOURCE' : 'NEW RESOURCE'}
            </span>
            <h2>{initial ? initial.label : 'Add to your vault'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="modal-scroll">
          <div className="type-picker">
            {(Object.keys(typeMeta) as ResourceType[]).map((type) => {
              const Icon = typeMeta[type].icon;
              return (
                <button
                  type="button"
                  key={type}
                  className={form.type === type ? 'type-option active' : 'type-option'}
                  onClick={() => setForm(emptyPayload(type))}
                  disabled={Boolean(initial)}
                >
                  <Icon size={18} />
                  <span>{typeMeta[type].label}</span>
                </button>
              );
            })}
          </div>

          <div className="form-grid">
            <Field label="Display label" required>
              <input
                value={form.label}
                onChange={(event) => updateRoot('label', event.target.value)}
                placeholder="Example: Primary LinkedIn Account"
                required
              />
            </Field>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) => updateRoot(
                  'status',
                  event.target.value as ResourceStatus,
                )}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
                <option value="archived">Archived</option>
              </select>
            </Field>

            {form.type === 'proxy' && (
              <ProxyFields details={form.details} update={updateDetail} />
            )}

            {form.type === 'gift_card' && (
              <GiftCardFields details={form.details} update={updateDetail} />
            )}

            {['slynumber', 'google_voice', 'whatsapp'].includes(form.type) && (
              <PhoneFields
                type={form.type}
                details={form.details}
                update={updateDetail}
              />
            )}

            {form.type === 'linkedin_account' && (
              <LinkedInFields details={form.details} update={updateDetail} />
            )}

            {showExpiration && (
              <Field label="Expiration date">
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(event) => updateRoot('expiresAt', event.target.value)}
                />
              </Field>
            )}

            <Field label="Notes" wide>
              <textarea
                value={form.notes}
                onChange={(event) => updateRoot('notes', event.target.value)}
                placeholder="What is this resource used for? Add any operational notes."
                rows={4}
              />
            </Field>
          </div>

          {form.type === 'gift_card' && (
            <div className="security-notice">
              <ShieldCheck size={18} />
              <div>
                <strong>CVV is intentionally not stored.</strong>
                <p>Use this app for inventory and balance tracking, not payment-card authentication data.</p>
              </div>
            </div>
          )}

          {form.type === 'linkedin_account' && (
            <div className="security-notice sensitive-notice">
              <ShieldCheck size={18} />
              <div>
                <strong>Highly sensitive identity data</strong>
                <p>Date of birth, address, SSN, driver license and password are encrypted before they are written to SQLite.</p>
              </div>
            </div>
          )}

          {message && <div className="error-banner">{message}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add resource'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProxyFields({ details, update }: FieldGroupProps) {
  return (
    <>
      <Field label="IP address" required>
        <input
          value={String(details.ipAddress || '')}
          onChange={(event) => update('ipAddress', event.target.value)}
          placeholder="198.51.100.24"
          required
        />
      </Field>
      <Field label="Country">
        <input
          value={String(details.country || '')}
          onChange={(event) => update('country', event.target.value)}
          placeholder="United States"
        />
      </Field>
      <Field label="Proxy type">
        <select
          value={String(details.proxyType || '')}
          onChange={(event) => update('proxyType', event.target.value)}
        >
          <option value="">Select type</option>
          <option>Residential</option>
          <option>ISP</option>
          <option>Datacenter</option>
          <option>Mobile</option>
          <option>SOCKS5</option>
          <option>HTTP</option>
          <option>HTTPS</option>
        </select>
      </Field>
      <Field label="Port">
        <input
          type="number"
          min="1"
          max="65535"
          value={String(details.port || '')}
          onChange={(event) => update('port', event.target.value)}
          placeholder="8080"
        />
      </Field>
      <Field label="Username">
        <input
          value={String(details.username || '')}
          onChange={(event) => update('username', event.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          value={String(details.password || '')}
          onChange={(event) => update('password', event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Order number" wide>
        <input
          value={String(details.orderNumber || '')}
          onChange={(event) => update('orderNumber', event.target.value)}
          placeholder="ORD-2026-001"
        />
      </Field>
    </>
  );
}

function GiftCardFields({ details, update }: FieldGroupProps) {
  return (
    <>
      <Field label="Issuer / store">
        <input
          value={String(details.issuer || '')}
          onChange={(event) => update('issuer', event.target.value)}
          placeholder="Amazon, Visa prepaid, Target…"
        />
      </Field>
      <Field label="Card number">
        <input
          value={String(details.cardNumber || '')}
          onChange={(event) => update('cardNumber', event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Stored encrypted"
        />
      </Field>
      <Field label="UID">
        <input
          value={String(details.uid || '')}
          onChange={(event) => update('uid', event.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Deposit amount">
        <input
          type="number"
          min="0"
          step="0.01"
          value={String(details.depositAmount ?? '')}
          onChange={(event) => update('depositAmount', event.target.value)}
          placeholder="100.00"
        />
      </Field>
      <Field label="Current amount">
        <input
          type="number"
          min="0"
          step="0.01"
          value={String(details.currentAmount ?? '')}
          onChange={(event) => update('currentAmount', event.target.value)}
          placeholder="75.50"
        />
      </Field>
    </>
  );
}

function PhoneFields({
  type,
  details,
  update,
}: FieldGroupProps & { type: ResourceType }) {
  return (
    <>
      <Field label="Phone number" required>
        <input
          value={String(details.phoneNumber || '')}
          onChange={(event) => update('phoneNumber', event.target.value)}
          placeholder="+1 555 000 1234"
          required
        />
      </Field>

      {type !== 'whatsapp' && (
        <Field label="Related email">
          <input
            type="email"
            value={String(details.relatedEmail || '')}
            onChange={(event) => update('relatedEmail', event.target.value)}
            placeholder="account@example.com"
          />
        </Field>
      )}

      {type === 'google_voice' && (
        <Field label="Contact name">
          <input
            value={String(details.contactName || '')}
            onChange={(event) => update('contactName', event.target.value)}
            placeholder="Client or contact name"
          />
        </Field>
      )}

      <Field label="Used services" wide>
        <input
          value={String(details.usedServices || '')}
          onChange={(event) => update('usedServices', event.target.value)}
          placeholder="Gmail, customer support, marketplace account…"
        />
      </Field>
    </>
  );
}

function LinkedInFields({ details, update }: FieldGroupProps) {
  const employmentHistory = normalizeEmployment(details.employmentHistory);
  const education = normalizeEducation(details.education);

  function updateEmployment(
    index: number,
    key: keyof LinkedInEmployment,
    value: string | boolean,
  ) {
    const next = employmentHistory.map((item, itemIndex) => {
      if (itemIndex !== index) return item;

      const updated = { ...item, [key]: value };
      if (key === 'isCurrent' && value === true) updated.endDate = '';
      return updated;
    });

    update('employmentHistory', next);
  }

  function addEmployment() {
    update('employmentHistory', [...employmentHistory, emptyEmployment()]);
  }

  function removeEmployment(index: number) {
    update(
      'employmentHistory',
      employmentHistory.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function updateEducation(
    index: number,
    key: keyof LinkedInEducation,
    value: string,
  ) {
    const next = education.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    ));
    update('education', next);
  }

  function addEducation() {
    update('education', [...education, emptyEducation()]);
  }

  function removeEducation(index: number) {
    update(
      'education',
      education.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  return (
    <div className="linkedin-sections wide">
      <section className="linkedin-form-section">
        <div className="section-heading">
          <div className="section-heading-icon"><UserRound size={18} /></div>
          <div>
            <h3>Personal information</h3>
            <p>Identity, location and LinkedIn sign-in details</p>
          </div>
        </div>

        <div className="nested-form-grid">
          <Field label="First name" required>
            <input
              value={String(details.firstName || '')}
              onChange={(event) => update('firstName', event.target.value)}
              required
            />
          </Field>
          <Field label="Last name" required>
            <input
              value={String(details.lastName || '')}
              onChange={(event) => update('lastName', event.target.value)}
              required
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={String(details.dob || '')}
              onChange={(event) => update('dob', event.target.value)}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={String(details.email || '')}
              onChange={(event) => update('email', event.target.value)}
              placeholder="account@example.com"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={String(details.password || '')}
              onChange={(event) => update('password', event.target.value)}
              autoComplete="new-password"
              placeholder="Stored encrypted"
            />
          </Field>
          <Field label="LinkedIn URL">
            <input
              type="url"
              value={String(details.linkedinUrl || '')}
              onChange={(event) => update('linkedinUrl', event.target.value)}
              placeholder="https://www.linkedin.com/in/profile-name/"
            />
          </Field>
          <Field label="Street address" wide>
            <input
              value={String(details.streetAddress || '')}
              onChange={(event) => update('streetAddress', event.target.value)}
              placeholder="Street and apartment or unit"
              autoComplete="off"
            />
          </Field>
          <Field label="County">
            <input
              value={String(details.county || '')}
              onChange={(event) => update('county', event.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              value={String(details.city || '')}
              onChange={(event) => update('city', event.target.value)}
            />
          </Field>
          <Field label="State">
            <input
              value={String(details.state || '')}
              onChange={(event) => update('state', event.target.value)}
              placeholder="TX"
              maxLength={30}
            />
          </Field>
          <Field label="ZIP code">
            <input
              value={String(details.zipCode || '')}
              onChange={(event) => update('zipCode', event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="SSN">
            <input
              type="password"
              value={String(details.ssn || '')}
              onChange={(event) => update('ssn', event.target.value)}
              autoComplete="off"
              placeholder="Stored encrypted"
            />
          </Field>
          <Field label="Driver license number">
            <input
              type="password"
              value={String(details.driverLicense || '')}
              onChange={(event) => update('driverLicense', event.target.value)}
              autoComplete="off"
              placeholder="Stored encrypted"
            />
          </Field>
          <Field label="Driver license state">
            <input
              value={String(details.driverLicenseState || '')}
              onChange={(event) => update('driverLicenseState', event.target.value)}
              placeholder="TX"
              maxLength={30}
            />
          </Field>
        </div>
      </section>

      <section className="linkedin-form-section">
        <div className="section-heading with-action">
          <div className="section-heading-main">
            <div className="section-heading-icon"><Briefcase size={18} /></div>
            <div>
              <h3>Employment history</h3>
              <p>Add positions in the order you want them displayed</p>
            </div>
          </div>
          <button type="button" className="add-entry-button" onClick={addEmployment}>
            <Plus size={15} /> Add position
          </button>
        </div>

        <div className="history-list">
          {employmentHistory.length === 0 && (
            <div className="history-empty">
              <p>No positions added.</p>
              <button type="button" onClick={addEmployment}>Add first position</button>
            </div>
          )}

          {employmentHistory.map((item, index) => (
            <div className="history-entry" key={`employment-${index}`}>
              <div className="history-entry-header">
                <strong>Position {index + 1}</strong>
                <button
                  type="button"
                  className="remove-entry-button"
                  onClick={() => removeEmployment(index)}
                  aria-label={`Remove position ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="history-entry-grid">
                <Field label="Job title">
                  <input
                    value={item.jobTitle}
                    onChange={(event) => updateEmployment(
                      index,
                      'jobTitle',
                      event.target.value,
                    )}
                    placeholder="Frontend AI & Application Support Engineer"
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={item.company}
                    onChange={(event) => updateEmployment(
                      index,
                      'company',
                      event.target.value,
                    )}
                    placeholder="Company name"
                  />
                </Field>
                <Field label="Employment type">
                  <select
                    value={item.employmentType}
                    onChange={(event) => updateEmployment(
                      index,
                      'employmentType',
                      event.target.value,
                    )}
                  >
                    <option value="">Select type</option>
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Freelance</option>
                    <option>Internship</option>
                    <option>Self-employed</option>
                    <option>Temporary</option>
                  </select>
                </Field>
                <Field label="Start date">
                  <input
                    type="month"
                    value={item.startDate}
                    onChange={(event) => updateEmployment(
                      index,
                      'startDate',
                      event.target.value,
                    )}
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="month"
                    value={item.endDate}
                    onChange={(event) => updateEmployment(
                      index,
                      'endDate',
                      event.target.value,
                    )}
                    disabled={item.isCurrent}
                  />
                </Field>
                <label className="current-role-toggle">
                  <input
                    type="checkbox"
                    checked={item.isCurrent}
                    onChange={(event) => updateEmployment(
                      index,
                      'isCurrent',
                      event.target.checked,
                    )}
                  />
                  <span>This is my current role</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="linkedin-form-section">
        <div className="section-heading with-action">
          <div className="section-heading-main">
            <div className="section-heading-icon"><GraduationCap size={18} /></div>
            <div>
              <h3>Education</h3>
              <p>Add schools, degrees, years and locations</p>
            </div>
          </div>
          <button type="button" className="add-entry-button" onClick={addEducation}>
            <Plus size={15} /> Add education
          </button>
        </div>

        <div className="history-list">
          {education.length === 0 && (
            <div className="history-empty">
              <p>No education records added.</p>
              <button type="button" onClick={addEducation}>Add first education record</button>
            </div>
          )}

          {education.map((item, index) => (
            <div className="history-entry" key={`education-${index}`}>
              <div className="history-entry-header">
                <strong>Education {index + 1}</strong>
                <button
                  type="button"
                  className="remove-entry-button"
                  onClick={() => removeEducation(index)}
                  aria-label={`Remove education ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="history-entry-grid">
                <Field label="School / university">
                  <input
                    value={item.school}
                    onChange={(event) => updateEducation(
                      index,
                      'school',
                      event.target.value,
                    )}
                    placeholder="University name"
                  />
                </Field>
                <Field label="Degree">
                  <input
                    value={item.degree}
                    onChange={(event) => updateEducation(
                      index,
                      'degree',
                      event.target.value,
                    )}
                    placeholder="Bachelor's degree"
                  />
                </Field>
                <Field label="Start year">
                  <input
                    type="number"
                    min="1900"
                    max="2200"
                    value={item.startYear}
                    onChange={(event) => updateEducation(
                      index,
                      'startYear',
                      event.target.value,
                    )}
                    placeholder="2016"
                  />
                </Field>
                <Field label="End year">
                  <input
                    type="number"
                    min="1900"
                    max="2200"
                    value={item.endYear}
                    onChange={(event) => updateEducation(
                      index,
                      'endYear',
                      event.target.value,
                    )}
                    placeholder="2020"
                  />
                </Field>
                <Field label="Location" wide>
                  <input
                    value={item.location}
                    onChange={(event) => updateEducation(
                      index,
                      'location',
                      event.target.value,
                    )}
                    placeholder="Chicago, Illinois"
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface FieldGroupProps {
  details: ResourceDetails;
  update: (key: string, value: unknown) => void;
}

function Field({
  label,
  required = false,
  wide = false,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>
        {label}
        {required && <em>*</em>}
      </span>
      {children}
    </label>
  );
}

export default App;