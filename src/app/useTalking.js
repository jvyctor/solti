// Pairs of agents that are talking (the rope between them animates): an open canvas_ask holds the pair "on";
// every message keeps it on for commSeconds after the last one.
import { useEffect, useState } from 'react'
import { api } from '../shared.js'

export function useTalking(settingsRef) {
  const [talking, setTalking] = useState(() => new Set())
  useEffect(() => {
    const waiting = new Map() // pair -> open asks
    const until = new Map() // pair -> expiry ms
    let timer
    const recompute = () => {
      const now = Date.now()
      const keys = new Set(waiting.keys())
      let next = Infinity
      for (const [k, t] of until) {
        if (t > now) { keys.add(k); next = Math.min(next, t) } else until.delete(k)
      }
      setTalking(keys)
      clearTimeout(timer)
      if (next < Infinity) timer = setTimeout(recompute, next - now + 20)
    }
    const off = api.onComm(({ kind, a, b }) => {
      const k = [a, b].sort().join('|')
      const hold = (settingsRef.current?.custom?.commSeconds || 6) * 1000
      if (kind === 'start') waiting.set(k, (waiting.get(k) || 0) + 1)
      else {
        if (kind === 'end') {
          const n = (waiting.get(k) || 1) - 1
          n > 0 ? waiting.set(k, n) : waiting.delete(k)
        }
        until.set(k, Date.now() + hold)
      }
      recompute()
    })
    return () => { off(); clearTimeout(timer) }
  }, [])
  return talking
}
