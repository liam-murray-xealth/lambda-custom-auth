import chai from 'chai'
import sinonChai from 'sinon-chai'

chai.use(sinonChai)

chai.config.includeStack = true

// Lambda needs these when modules are loaded (globals)
process.env.SERVICE_NAME = 'service123'
process.env.RESOURCE_SERVER_ID = 'resServer123'
process.env.USER_POOL_ID = 'pool123'
process.env.AWS_REGION = 'us-west-2'
