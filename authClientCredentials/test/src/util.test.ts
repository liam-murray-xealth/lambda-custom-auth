import chai from 'chai'
import 'mocha'
import { envStr, getStr, getStrOpt } from '../../src/utils'

//import Sinon from 'sinon'
const expect = chai.expect

describe('env util', function () {
  before(function () {
    process.env.FOOBAR = 'foobar'
  })

  it('should get env', function () {
    expect(envStr('FOOBAR')).to.equal('foobar')
  })
})
