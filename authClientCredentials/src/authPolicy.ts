const allowedVerbs = ['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'DELETE', 'OPTIONS', '*'] as const
// export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'HEAD' | 'DELETE' | 'OPTIONS' | '*'
export type HttpVerb = typeof allowedVerbs[number]

export type Statement = {
  Action: string
  Effect: string
  Resource: string[]
  Condition?: string[]
}

type PolicyDoc = {
  Version: string
  Statement: Statement[]
}
type Policy = {
  principalId: string
  policyDocument: PolicyDoc
}

export type Condition = any

export type Method = {
  resourceArn: string
  conditions: Condition[]
}

export type AuthPolicyOptions = {
  restApiId?: string
  region?: string
  stage?: string
}

function withoutPrefixSlash(str: string): string {
  return str.slice(str.startsWith('/') ? 1 : 0)
}

function getEmptyStatement(effect: string): Statement {
  effect = effect.slice(0, 1).toUpperCase() + effect.slice(1, effect.length).toLowerCase()
  return {
    Action: 'execute-api:Invoke',
    Effect: effect,
    Resource: [],
  }
}

function getStatementsForEffect(effect: string, methods: Method[]): Statement[] {
  if (methods.length == 0) {
    return []
  }
  const statements: Statement[] = []

  //
  const vanillaStatement = getEmptyStatement(effect)

  for (const method of methods) {
    if ((method.conditions || []).length === 0) {
      vanillaStatement.Resource.push(method.resourceArn)
    } else {
      // Build conditional statement
      const statement = getEmptyStatement(effect)
      statement.Resource.push(method.resourceArn)
      statement.Condition = method.conditions
      statements.push(statement)
    }
  }

  if ((vanillaStatement.Resource || []).length > 0) {
    statements.push(vanillaStatement)
  }

  return statements
}

/**
 * Pass CustomAuthorizerEvent.methodArn
 */
export function getDenyPolicy(methodArn: string): Policy {
  return {
    principalId: '*',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: [methodArn],
        },
      ],
    },
  }
}

/**
 * AuthPolicyBuilder receives a set of allowed and denied methods and generates a valid
 * AWS policy for the API Gateway authorizer. The constructor receives the calling
 * user principal, the AWS account ID of the API owner, and an apiOptions object.
 * The apiOptions can contain an API Gateway RestApi Id, a region for the RestApi, and a
 * stage that calls should be allowed/denied for. For example
 * {
 *   restApiId: "xxxxxxxxxx",
 *   region: "us-east-1",
 *   stage: "dev"
 * }
 *
 * var testPolicy = new AuthPolicyBuilder("[principal user identifier]", "[AWS account id]", apiOptions);
 * testPolicy.allowMethod('GET', "/users/username");
 * testPolicy.denyMethod('POST', "/pets");
 * testPolicy.build()
 *
 * @class AuthPolicys
 */
export class AuthPolicyBuilder {
  private readonly version: string
  private readonly pathRegex: RegExp
  private readonly allowMethods: Method[]
  private readonly denyMethods: Method[]
  private readonly restApiId: string
  private readonly region: string
  private readonly stage: string

  constructor(
    private readonly principal: string,
    private readonly awsAccountId: string,
    opts: AuthPolicyOptions
  ) {
    this.version = '2012-10-17'
    this.pathRegex = new RegExp('^[/.a-zA-Z0-9-*]+$')

    this.allowMethods = []
    this.denyMethods = []

    this.restApiId = opts?.restApiId || '*'
    this.region = opts?.region || '*'
    this.stage = opts?.stage || '*'
  }

  allowAllMethods() {
    this.addMethod('allow', '*', '*')
  }

  denyAllMethods() {
    this.addMethod('deny', '*', '*')
  }

  allowMethod(verb: HttpVerb, resource: string) {
    this.addMethod('allow', verb, resource)
  }

  denyMethod(verb: HttpVerb, resource: string) {
    this.addMethod('deny', verb, resource)
  }

  allowMethodWithConditions(verb: HttpVerb, resource: string, conditions: Condition[]) {
    this.addMethod('allow', verb, resource, conditions)
  }

  denyMethodWithConditions(verb: HttpVerb, resource: string, conditions: Condition[]) {
    this.addMethod('deny', verb, resource, conditions)
  }

  addMethod(effect, verb: HttpVerb, resource: string, conditions?: Condition[]) {
    if (!this.pathRegex.test(resource)) {
      throw new Error(`Invalid resource path: '${resource}'. Path should match ${this.pathRegex}`)
    }

    resource = withoutPrefixSlash(resource)
    const resourceArn = `arn:aws:execute-api:${this.region}:${this.awsAccountId}:${this.restApiId}/${this.stage}/${verb}/${resource}`

    if (effect.toLowerCase() == 'allow') {
      this.allowMethods.push({
        resourceArn: resourceArn,
        conditions: conditions || [],
      })
    } else if (effect.toLowerCase() == 'deny') {
      this.denyMethods.push({
        resourceArn: resourceArn,
        conditions: conditions || [],
      })
    }
  }

  /**
   * Creates the policy
   */
  build(): Policy {
    if (
      (!this.allowMethods || this.allowMethods.length === 0) &&
      (!this.denyMethods || this.denyMethods.length === 0)
    ) {
      throw new Error('No statements defined for the policy')
    }

    const doc: PolicyDoc = {
      Version: this.version,
      Statement: [
        ...getStatementsForEffect('Allow', this.allowMethods),
        ...getStatementsForEffect('Deny', this.denyMethods),
      ],
    }
    const policy: Policy = {
      principalId: this.principal,
      policyDocument: doc,
    }

    return policy
  }
}
