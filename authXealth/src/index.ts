import { parseAuthHeader, createHash, deriveSecret } from './auth'
import { getStr, envStr } from './util'
import { CustomAuthorizerEvent } from 'aws-lambda'
import { URLSearchParams } from 'url'
import _get from 'lodash.get'
import Path from 'path'
import { getSecureJsonParam } from './awsUtil'

/**
 * Returns 'true' if date in header is valid and
 * falls within time given by max age.
 */
export function isValidDataHeader(date: string, maxAgeMinutes: number = 5) {
  const now = new Date()
  const given = new Date(date)
  if (Number.isNaN(given.getTime())) {
    console.log('Date in header is not valid ISO 8601')
    return false
  }
  const diff = now.getTime() - given.getTime()
  if (diff < 0) {
    console.log('Date in header is future date')
    return false
  }

  const maxMillisecs = maxAgeMinutes * 60 * 1000
  if (diff > maxMillisecs) {
    console.log('Date in header is too old')
    return false
  }
  return true
}

export function createStringToSignFromAuthEvent(event: CustomAuthorizerEvent): string {
  const method = getStr(event, 'requestContext.httpMethod').toUpperCase()
  const accept = getStr(event, 'headers.Accept')
  // Verify valid ISO 8601?
  const date = getStr(event, 'headers.Date')
  if (!isValidDataHeader(date)) {
    throw new Error(`Invalid date: ${date}`)
  }
  const query = new URLSearchParams(event.queryStringParameters || {}).toString()
  const queryAppend = query ? `?${query}` : ''
  const host = getStr(event, 'headers.Host')
  // event.host strips the /<stage> prefix
  const path = getStr(event, 'requestContext.path')
  const fullPath = `${path}${queryAppend}`
  return [method, fullPath, host, accept, date].join('\n')
}

// GET
// /orders?limit=1
// l5b4wldobh.execute-api.us-west-2.amazonaws.com
// application/json
// 2019-11-18T00:10:59.155Z

type ApiKeyInfo = {
  id: string
  apiKey: string
  privateKey: string
  secret: string
}

async function lookupApiKeyInfo(apiKey: string, keyInfoPath: string): Promise<ApiKeyInfo> {
  console.log(`Looking up api key info ${keyInfoPath}`)
  const ob = await getSecureJsonParam(undefined, keyInfoPath)
  const secret = deriveSecret(apiKey, ob.privateKey)
  return {
    apiKey: apiKey,
    id: ob.id,
    privateKey: ob.privateKey,
    secret,
  }
}

export async function authenticateRequest(event: CustomAuthorizerEvent): Promise<ApiKeyInfo> {
  const authHeaderValue = getStr(event, 'headers.Authorization')
  const parsed = parseAuthHeader(authHeaderValue)
  const keyInfoPath = Path.join(envStr('SSM_SECRETS_BASE_PATH'), parsed.key)
  const keyInfo = await lookupApiKeyInfo(parsed.key, keyInfoPath)
  const sts = createStringToSignFromAuthEvent(event)
  const ours = createHash(sts, keyInfo.secret)
  const theirs = parsed.hash
  console.log(`Ours ${ours}`)
  console.log(`Theirs: ${theirs}`)
  if (ours === theirs) {
    return keyInfo
  }
  throw new Error(`Our hash (${ours} does not match theirs (${theirs}`)
}

async function getAuthResponse(event: CustomAuthorizerEvent) {
  if (!event.headers) {
    throw new Error('Missing headers')
  }
  const token = event.headers.Authorization
  if (!token) {
    throw new Error('Missing header: Authorization')
  }
  const keyInfo = await authenticateRequest(event)
  return generateAuthResponse(keyInfo.id, 'Allow', event.methodArn, {
    apiKey: keyInfo.apiKey,
  })
}

/**
 * Lambda entrypoint
 */
export async function handler(event: CustomAuthorizerEvent) {
  console.log(`XealthAuth (event): ${JSON.stringify(event, null, 2)}`)

  let resp
  try {
    resp = await getAuthResponse(event)
  } catch (err) {
    console.log(`Failed to authenticate: ${err.toString()}`)
    resp = generateAuthResponse('*', 'Deny', event.methodArn)
  }
  console.log(`Auth response  ${JSON.stringify(resp, null, 2)}`)
  return resp
}

/**
 * Context is optional arbitrary data passed to integration endpoint
 * Useful for authorizer that only handles authentication (identity) part
 */
function generateAuthResponse(
  principalId: string,
  effect: string,
  methodArn: string,
  context: object = {}
) {
  const policyDocument = generatePolicyDocument(effect, methodArn)
  return {
    principalId,
    context,
    policyDocument,
  }
}

function generatePolicyDocument(effect: string, methodArn: string) {
  if (!effect || !methodArn) return null

  // Must be valid IAM policy
  const policyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: methodArn,
      },
    ],
  }

  return policyDocument
}
