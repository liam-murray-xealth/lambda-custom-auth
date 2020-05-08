import chai from 'chai'
import 'mocha'
import createPemCacheLazyLoader, { PemCache } from '../../src/pemCache'

//import Sinon from 'sinon'
const expect = chai.expect

describe('Fetch PEMs', function () {
  it('should fetch PEMs', async function () {
    const region = 'us-west-2'
    // TODO mock (this a real cognito pool id, modify as needed)
    const userPoolId = 'us-west-2_h90AFZOcj'
    const baseUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
    const getPemCache = createPemCacheLazyLoader(baseUrl)
    const res = await getPemCache()
    console.log(JSON.stringify(res, null, 2))
  })
})
