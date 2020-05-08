import env from 'env-var'
import _get from 'lodash.get'
import pino from 'pino'

export function envStr(key: string): string {
  return env.get(key).required().asString()
}
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: envStr('SERVICE_NAME'),
})

export function getStr(ob: Record<string, any>, key: string): string {
  const val = _get(ob, key)
  if (val == null) {
    throw new Error(`Missing key ${key}`)
  }
  return val
}

export function getStrOpt(ob: Record<string, any>, key: string): string {
  return _get(ob, key)
}
