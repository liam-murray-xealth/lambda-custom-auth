import AWS from 'aws-sdk'
import { envStr } from './util'
import _get from 'lodash.get'

//
// Generic AWS SDK utils
//

function ensureRegion(region?: string) {
  return region || envStr('AWS_REGION')
}

// export function createDynamoDb(region?: string): AWS.DynamoDB {
//   return new AWS.DynamoDB({ apiVersion: '2012-08-10', region: ensureRegion(region) })
// }

export function createDynamoDocClient(region?: string): AWS.DynamoDB.DocumentClient {
  let ep
  if (process.env.AWS_SAM_LOCAL == 'true') {
    ep = {
      endpoint: process.env.LOCAL_DDB_ENDPOINT,
    }
  }
  return new AWS.DynamoDB.DocumentClient({
    apiVersion: '2012-08-10',
    region: ensureRegion(region),
    ...ep,
  })
}

export function createSSM(region?: string): AWS.SSM {
  return new AWS.SSM({ apiVersion: '2014-11-06', region: ensureRegion(region) })
}

export async function getSecureParam(ssm: AWS.SSM | void, path: string, isJson: boolean = false) {
  const client = ssm || createSSM()
  const res = await client.getParameter({ Name: path, WithDecryption: true }).promise()
  if (res && res.Parameter && res.Parameter.Value && res.Parameter.Type === 'SecureString') {
    return isJson ? JSON.parse(res.Parameter.Value) : res.Parameter.Value
  }
  throw new Error(`Failed to lookup parameter ${path}`)
}

/**
 * Returns secure string parameter assumed stored as JSON.
 * You can pass a path into the JSON object to retrieve a portion of the object.
 * Example:
 *    /path/to/value:path.in.json
 */
export async function getSecureJsonParam(ssm: AWS.SSM | void, pathKey: string) {
  const [name, key] = pathKey.split(':')
  const val = await getSecureParam(ssm, name, true)
  return key ? _get(val, key) : val
}
