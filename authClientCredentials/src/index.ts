import jwt, { Secret, VerifyOptions } from 'jsonwebtoken'
import { envStr, logger } from './utils'
import { APIGatewayAuthorizerEvent, APIGatewayTokenAuthorizerEvent } from 'aws-lambda'
import { promisify } from 'util'
import { HttpVerb, AuthPolicyBuilder, getDenyPolicy, AuthPolicyOptions } from './authPolicy'
import createPemCacheLazyLoader, { PemCache } from './pemCache'

// logger.info({ env: process.env }, 'Loading function')

const userPoolId = envStr('USER_POOL_ID')
const region = envStr('AWS_REGION')

const resServerId = envStr('RESOURCE_SERVER_ID')
const ORDER_RW_SCOPE = `${resServerId}/rw`
const ORDER_RO_SCOPE = `${resServerId}/ro`

const baseUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
const getPemCache = createPemCacheLazyLoader(baseUrl)

// This deals with typesript + promisify + function overloads (better solution?)
type vf = (token: string, secretOrPublicKey: Secret, options?: VerifyOptions) => object | string
const verifyJwt = promisify(jwt.verify as vf)

/**
 * Lambda entrypoint
 *
 * 1) API client gets bearer token, e.g.:
 *      POST https://YOUR_DOMAIN/oauth/token
 *      grant_type=client_credentials
 *      client_id=<id>
 *      client_secret=<secret>
 *      scope=<scope>
 *
 * 2) Cognito returns token as JWT signed with private key
 *
 * 3) API is called with token
 *
 *    Authorization: Bearer UAj2yiGAcMZGxfN2DhcUbl9v8WsR
 *
 * 4) This custom auth lambda is invoked
 *
 * See: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html
 *
 * 5) We download and cache cognito public keys for verification of JWT
 *
 *
 */

export async function handler(event: APIGatewayAuthorizerEvent) {
  logger.info(`OAuth (event): ${JSON.stringify(event, null, 2)}`)

  if (event.type != 'TOKEN') {
    throw new Error(`Not supported: ${event.type}`)
  }
  const tokenEvent = event as APIGatewayTokenAuthorizerEvent

  const pems = await getPemCache()

  let resp
  try {
    resp = await getAllowPolicy(pems, tokenEvent)
  } catch (err) {
    console.log(`Failed to authenticate: ${err.toString()}`)
    resp = getDenyPolicy(event.methodArn)
  }
  console.log(`Auth response  ${JSON.stringify(resp, null, 2)}`)
  return resp
}

/**
 * Handles "Bearer token" or "token" in auth header
 */
function getBearerToken(event: APIGatewayTokenAuthorizerEvent): string {
  // Pulle out from event.headers.Authorization
  const token = event.authorizationToken
  if (!token) {
    throw new Error('Missing token')
  }
  const parts: string[] = token.split(' ')
  if (parts.length === 1) {
    return token
  }

  // Should be "Bearer XYZ"
  if (parts.length != 2) {
    throw new Error(`Bad authorization: '${token}'`)
  }
  const schema = parts[0].toLowerCase()
  if (schema != 'bearer') {
    throw new Error(`Schema ${schema} not supported`)
  }
  return parts[1]
}

// Partially filled out
type CognitoBearerTokenPayload = {
  username: string,
  sub: string,
  aud: string,
  email_verified: boolean,
  token_use: string,
  auth_time: number,
  iss: string,
  exp: number,
  // Space separated
  scope: string,
  client_id: string
}

type tokenEvent = {
  type: 'TOKEN',
  methodArn: string,
  authorizationToken: string
}

/**
 * See:
 * https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html#amazon-cognito-user-pools-using-tokens-step-1
 * https://aws.amazon.com/premiumsupport/knowledge-center/decode-verify-cognito-json-token/
 */
async function getVerifiedTokenPayload(pems, token: string): Promise<CognitoBearerTokenPayload> {
  // Pass 'complete' to get { payload, header, signature }
  const decoded = jwt.decode(token, { complete: true })
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('invalid JWT token')
  }

  const header = decoded.header
  if (!header) {
    throw new Error('bad header')
  }

  const pem: Secret = pems[header.kid]
  if (!pem) {
    throw new Error('No known key id ${header.kid}')
  }

  const opts: VerifyOptions = {
    algorithms: ['RS256'],
    issuer: baseUrl,
  }

  const verifyJwt = promisify(jwt.verify as vf)
  const payload = (await verifyJwt(token, pem, opts)) as CognitoBearerTokenPayload
  if (typeof payload !== 'object') {
    throw new Error('expected object')
  }

  if (payload.token_use != 'access') {
    throw new Error('Not an access token')
  }
  return payload
}

export type ParsedMethodArn = {
  restApiId: string,
  stage: string,
  verb: string,
  path: string,
  account: string
}

export function parseMethodArn(arn: string): ParsedMethodArn {
  // arn:aws:execute-api:us-west-2:958019638877:f4inwdzg90/dev/GET/orders
  // arn:aws:execute-api:region:account-id:api-id/stage-name/HTTP-VERB/resource-path-specifier

  const at = arn.lastIndexOf(':')
  // arn:aws:execute-api:us-west-2:958019638877
  const lhs = arn.slice(0, at)
  // api-id/stage-name/HTTP-VERB/resource-path-specifier
  const rhs = arn.slice(at + 1)

  const account = lhs.slice(lhs.lastIndexOf(':') + 1)
  const [restApiId, stage, verb, ...rest] = rhs.split('/')
  return {
    account,
    restApiId,
    stage,
    verb,
    path: rest.join('/'),
  }
}
async function getAllowPolicy(pems: PemCache, event: APIGatewayTokenAuthorizerEvent) {
  const token = getBearerToken(event)

  const payload = await getVerifiedTokenPayload(pems, token)

  logger.info(`Token payload: ${JSON.stringify(payload)}`)

  // Not 'username' because username is reassignable (sub is UUID for user)
  const principalId = payload.sub

  // We don't get event.requestContext with TOKEN
  const { account, restApiId, stage } = parseMethodArn(event.methodArn)

  const opts: AuthPolicyOptions = {
    region: region,
    restApiId,
    stage,
  }

  const builder = new AuthPolicyBuilder(principalId, account, opts)

  // Any authenticated clients can list orders
  builder.allowMethod('GET', '/orders')

  const writeVerbs: HttpVerb[] = ['POST', 'DELETE', 'PATCH']

  const scopes = (payload.scope || '').split(' ').filter(Boolean)
  for (const scope of scopes) {
    switch (scope) {
      case ORDER_RW_SCOPE:
        writeVerbs.forEach(v => {
          builder.allowMethod(v, '/orders/*')
        })
        break
      case ORDER_RO_SCOPE:
        break
      default:
        throw new Error(`Invalid scope ${scope}`)
    }
  }

  // authResponse.usageIdentifierKey = payload["client_id"]
  return builder.build()
}
