import chai from 'chai'
import 'mocha'
import { AuthPolicyBuilder } from '../../src/authPolicy'

describe('AuthPolicyBuilder', function () {
  it('should get env', function () {
    const builder = new AuthPolicyBuilder('principal', 'account', {})
    builder.allowMethod('GET', '/orders')
    const policy = builder.build()
    console.log(JSON.stringify(policy, null, 2))
  })
})
