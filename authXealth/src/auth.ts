import Url from 'url'
import crypto from 'crypto'
import _get from 'lodash.get'

/**
 * Parses {key, hash} from authorization header
 *
 *  Authorization: XEALTH apikey:signature
 *
 */
export type AuthHeaderValue = {
  key: string
  hash: string
}
export function parseAuthHeader(auth: string): AuthHeaderValue {
  let parts = auth.split(' ')
  if (parts.length !== 2) {
    throw new Error('Bad auth header (should split two parts on space)')
  }
  if (parts[0] !== 'XEALTH') {
    throw new Error('Bad auth header (should start with XEALTH)')
  }
  parts = parts[1].split(':')
  if (parts.length !== 2) {
    throw new Error('Bad auth header (right side should split two parts on colon)')
  }
  const [key, hash] = parts
  return {
    key,
    hash,
  }
}

/**
 * Components needed to sign outgoing request
 */
export type SignedRequestOpts = {
  apiKey: string
  secret: string
  url: string
  method: string
  queryString?: string
  body?: Object
  json?: boolean
  accept?: string
}

/**
 * Creates options for signing outgoing http request
 * Adds:
 *   Authorization
 *   Date
 *   Accept
 */
export function createSignedRequestParams(param: SignedRequestOpts) {
  const {
    apiKey,
    secret,
    url,
    method,
    queryString,
    body,
    json,
    accept = 'application/json',
  } = param

  const fullPath = queryString ? `${url}?${queryString}` : url
  const dateStr = new Date().toISOString()
  const parsedUrl = Url.parse(fullPath)
  const stringToSign = [
    method.toUpperCase(),
    parsedUrl.path,
    parsedUrl.hostname,
    accept,
    dateStr,
  ].join('\n')
  const hash = createHash(stringToSign, secret)
  const auth = `XEALTH ${apiKey}:${hash}`

  const body_ = body ? { body } : undefined
  const json_ = json ? { json } : undefined
  const queryString_ = queryString ? { qs: queryString } : undefined
  return {
    url,
    method,
    headers: {
      Accept: accept,
      Date: dateStr,
      Authorization: auth,
    },
    ...body_,
    ...json_,
    ...queryString_,
  }
}

export function createStringToSignFormSignedRequestOpts(params: SignedRequestOpts) {
  const { url, method, queryString, accept = 'application/json' } = params
  const fullPath = queryString ? `${url}?${queryString}` : url
  const dateStr = new Date().toISOString()
  const parsedUrl = Url.parse(fullPath)
  return [method.toUpperCase(), parsedUrl.path, parsedUrl.hostname, accept, dateStr].join('\n')
}

export function deriveSecret(apiKey: string, privateKey: string) {
  return crypto.createHmac('sha256', privateKey).update(apiKey).digest('base64')
}

export function createHash(stringToSign: string, secret: string) {
  console.log(`Creating hash: ${stringToSign}`)
  return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
}
