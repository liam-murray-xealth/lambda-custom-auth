import axios from 'axios'
import jwkToPem from 'jwk-to-pem'
import { logger } from './utils'

export type PemCache = {
  [key: string]: string
}

export type CognitoJwk = {
  alg: string
  e: string
  kid: string
  kty: 'RSA' | 'EC'
  n: string
  use: string
}

export type CognitoJwkResponse = {
  keys: CognitoJwk[]
}

/**
 * Returns map of well-known PEMs fetched from cognito
 *
 * See:
 *  https://aws.amazon.com/premiumsupport/knowledge-center/decode-verify-cognito-json-token/
 */
export async function fetchCognitoPemKeys(url): Promise<PemCache> {
  logger.info(`Fetching PEMs from ${url}`)

  try {
    const response = await axios.get(url)
    if (response.status != 200) {
      throw new Error(`Bad reponse ${response.status} ${response.data}`)
    }
    const body = response.data as CognitoJwkResponse
    const keys = body.keys || []
    const pems: PemCache = keys.reduce((out, key: CognitoJwk) => {
      const { kid: keyId, kty: keyType, n: modulus, e: exponent } = key
      console.log(JSON.stringify(key, null, 2))
      if (keyType == 'RSA') {
        out[keyId] = jwkToPem({ kty: keyType, n: modulus, e: exponent })
      }
      return out
    }, {})
    return pems
  } catch (error) {
    if (error.response) {
      logger.error(error.response.data)
      logger.error(error.response.status)
      logger.error(error.response.headers)
    }
    throw error
  }
}

// const baseUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
// const getPemCache = createPemCacheLazyLoader(baseUrl)
// const pems = await getPemCache()

export default function createPemCacheLazyLoader(baseUrl: string): () => Promise<PemCache> {
  let cachedPems: PemCache
  return async function () {
    if (!cachedPems) {
      const url = `${baseUrl}/.well-known/jwks.json`
      cachedPems = await fetchCognitoPemKeys(url)
    }
    return cachedPems
  }
}
