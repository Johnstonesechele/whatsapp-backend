'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [health, setHealth] = useState<any>(null)
  const [token, setToken] = useState('')
  const [conn, setConn] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/whatsapp/health')
        setHealth(await r.json())
      } catch (e: any) {
        setHealth({ ok: false, error: String(e) })
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [])

  async function checkConn() {
    setLoading(true)
    setConn(null)
    try {
      const r = await fetch('/api/whatsapp/connection-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setConn(await r.json())
    } catch (e: any) {
      setConn({ ok: false, error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>WhatsApp Backend — Status Dashboard</h1>
      <section style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Health</h2>
        {health ? (
          <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <p>Checking…</p>
        )}
      </section>
      <section style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Connection Status (paste a JWT from the CRM)</h2>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bearer token"
          style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
        />
        <button onClick={checkConn} disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Checking…' : 'Check'}
        </button>
        {conn && (
          <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto', marginTop: 8 }}>{JSON.stringify(conn, null, 2)}</pre>
        )}
      </section>
      <p style={{ marginTop: '2rem', color: '#666', fontSize: 12 }}>
        Backend for the Union CRM WhatsApp features. Health: <code>/api/whatsapp/health</code>
      </p>
    </main>
  )
}
