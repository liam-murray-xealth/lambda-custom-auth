import chai from 'chai'
import 'mocha'
import { ParsedMethodArn, parseMethodArn } from '../../src/index'
const expect = chai.expect

describe('Utils', function () {
  it('parse method ARN', function () {
    const arn = 'arn:aws:execute-api:us-west-2:958019638877:f4inwdzg90/dev/GET/orders'
    const parsed: ParsedMethodArn = parseMethodArn(arn)
    const expected: ParsedMethodArn = {
      account: '958019638877',
      restApiId: 'f4inwdzg90',
      stage: 'dev',
      verb: 'GET',
      path: 'orders',
    }
    expect(parsed).to.eql(expected)
  })
})
