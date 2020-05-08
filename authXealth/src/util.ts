import env from 'env-var'
import _get from 'lodash.get'

export function envStr(key: string): string {
  return env.get(key).required().asString()
}

export function getStr(ob: Object, key: string): string {
  const val = _get(ob, key)
  if (val == null) {
    throw new Error(`Missing key ${key}`)
  }
  return val
}

export function getStrOpt(ob: Object, key: string): string {
  return _get(ob, key)
}
