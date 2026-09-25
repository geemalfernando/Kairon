import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLE_LABEL } from '../../components/shell/nav'
import { Button, Card, CardHeader, PageHeader, Segmented } from '../../components/ui'
import { useSession, useTheme, type ThemePref } from '../../store'

export function Profile() {
  const user = useSession((s) => s.user)!
  const signOut = useSession((s) => s.signOut)
  const { pref, setPref } = useTheme()
  const [lang, setLang] = useState<'en' | 'si' | 'ta'>('en')
  const [notify, setNotify] = useState<'all' | 'critical'>('all')
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Account" title="Profile" />
      <Card className="mb-4 flex items-center gap-4 p-5">
        <span className="grid size-14 place-items-center rounded-full bg-teal font-display text-xl font-semibold text-white">{user.name[0]}</span>
        <div>
          <div className="font-display text-xl font-semibold">{user.name}</div>
          <div className="text-sm text-muted">
            {ROLE_LABEL[user.role]} · {user.depot} depot{user.assignedVehicle ? ` · ${user.assignedVehicle}` : ''}
            {user.assignedOutlet ? ` · ${user.assignedOutlet}` : ''}
          </div>
          <div className="text-xs text-faint">{user.email}</div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Preferences" />
        <div className="divide-y divide-line">
          <Row label="Appearance">
            <Segmented<ThemePref>
              value={pref}
              onChange={setPref}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Row>
          <Row label="Notifications">
            <Segmented
              value={notify}
              onChange={setNotify}
              options={[
                { value: 'all', label: 'All' },
                { value: 'critical', label: 'Critical only' },
              ]}
            />
          </Row>
          <Row label="Language" hint="Sinhala and Tamil are coming soon">
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'si', label: 'සිංහල' },
                { value: 'ta', label: 'தமிழ்' },
              ]}
            />
          </Row>
        </div>
      </Card>
      <Button
        variant="secondary"
        className="mt-6"
        icon={<LogOut className="size-4" />}
        onClick={() => {
          signOut()
          navigate('/login')
        }}
      >
        Sign out
      </Button>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
