'use strict'

const should = require('should')
    , neo4j = require('neo4j-driver').v1
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , n = require('../index')
    , _ = require('lodash')
    , r = require('../src/reify')

const url = 'bolt://localhost'
const username = 'neo4j'
const password = 'neo4j'

const uuid1 = uuid.unparse(jsmf.generateId())
const uuid2 = uuid.unparse(jsmf.generateId())
const uuid3 = uuid.unparse(jsmf.generateId())
const uuid4 = uuid.unparse(jsmf.generateId())
const uuid5 = uuid.unparse(jsmf.generateId())
const uuid6 = uuid.unparse(jsmf.generateId())

let driver, session

function initNeo4jConnector(done) {
  driver = neo4j.driver(url, neo4j.auth.basic(username, password))
  session = driver.session()
  n(url, username, password)
  n.initStorage()
  done()
}

function cleanDB(done) {
  return session.run('MATCH (n) DETACH DELETE n').then(() => done()).catch(err => done(err))
}

function closeNeo4j() {
  driver.close()
  n.close()
}

describe('saveModel', () => {

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('saves element', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves metamodel', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta {name: "MM"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves the referenceModel', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta {name: "MM"})<-[:referenceModel]-(b:Meta:Model {name: "M"}) RETURN (b)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves conformsTo relationship', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:Meta:Class {name: "A"})<-[:conformsTo]-(b:A) RETURN (b)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves classes', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Class {name: "A"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves enum', () => {
    const A = new jsmf.Enum('A', ['on', 'off'])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Enum {name: "A"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves enum values', () => {
    const A = new jsmf.Enum('A', ['on', 'off'])
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Enum {name: "A"})-[:values]->(b) RETURN (b)'))
      .then(x => x.records.length.should.equal(2))
  })

  it('saves class attributes', () => {
    const A = new jsmf.Class('A', [], {x:Number})
    const MM = new jsmf.Model('MM', {}, A)
    return n.saveModel(MM)
      .then(() => session.run('MATCH (a:Class {name: "A"})-[:attributes]->(b:Attribute {name: "x"}) RETURN (a)'))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves modellingElements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves relationship between models and elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves modellingElements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('saves relationship between models and elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (m:Model)-[:elements]->(a:A {__jsmf__: {jsmfId}}) RETURN (m)', {jsmfId}))
      .then(x => x.records.length.should.equal(1))
  })

  it('is idempotent on two saves', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => n.saveModel(M))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then( x => x.records.length.should.equal(1))
  })

  it('updates attributes on second save', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => n.saveModel(M))
      .then(() => { a.x = 24; return n.saveModel(M)})
      .then(() => session.run('MATCH (a:A {x: {x}}) RETURN (a)', {x: 24}))
      .then(x => x.records.length.should.equal(1))
  })

  it('updates ref on second save', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const B = new jsmf.Class('B', [], {}, {a: A})
    const MM = new jsmf.Model('MM', {}, A)
    const a0 = new A({x: 0})
        , a1 = new A({x: 1})
    const b = new B({a: a0})
    const M = new jsmf.Model('M', MM, [b, a0, a1])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 0}))
      .then(x => x.records.length.should.equal(1))
      .then(() => { b.a = a1; return n.saveModel(M)})
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 0}))
      .then(x => x.records.length.should.equal(0))
      .then(() => session.run('MATCH (a:B)-[]->(b {x: {x}}) RETURN (a)', {x: 1}))
      .then(x => x.records.length.should.equal(1))
  })

  it('changes uuid if duplicates', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    let b = new A({x: 24})
    b.__jsmf__.uuid = a.__jsmf__.uuid
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A) RETURN (a)'))
      .then(x => x.records.length.should.equal(2))
  })

  it('saves class hierarchy', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    const C = new jsmf.Class('C', [A,B])
    const MM = new jsmf.Model('MM', {}, [A,B,C])
    let a = new C()
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A:B:C {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves one attribute element', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId, x: a.x}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several attributes element', () => {
    const A = new jsmf.Class('A', [], {x: Number, y: String})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12, y: 'ahoy'})
    const M = new jsmf.Model('M', MM, [a])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId, x: a.x, y: a.y}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfIdA = uuid.unparse(jsmf.jsmfId(a))
        , jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfIdA}}) RETURN (a)', {jsmfIdA}))
      .then( x => x.records.length.should.equal(1))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfIdB}}) RETURN (a)', {jsmfIdB}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves elem with a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('a', A, 1)
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    a.a = b
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfIdA = uuid.unparse(jsmf.jsmfId(a))
        , jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfIdA}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfIdA)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
  })

  it('saves elem with references', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('a', A, 1)
    A.addReference('b', A, 1)
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    a.a = b
    a.b = b
    const M = new jsmf.Model('M', MM, [a,b])
    const jsmfId = uuid.unparse(jsmf.jsmfId(a))
    const jsmfIdB = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfId)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
      .then(() => session.run('MATCH (a) -[:b]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmfId)
        x.records[0].get('b.__jsmf__').should.equal(jsmfIdB)
      })
  })

  it('saves associated data attributes', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [], {x: Number})
    A.addReference('a', A, 1, undefined, undefined, B)
    const MM = new jsmf.Model('MM', {}, A)
    const a0 = new A()
        , a1 = new A()
        , b  = new B({x: 12})
    a0.addA(a1, b)
    const M = new jsmf.Model('M', MM, [a0,a1])
    const jsmfId = uuid.unparse(jsmf.jsmfId(b))
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[x:a]-> (b) RETURN x.x, x.__jsmf__'))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('x.x').should.equal(b.x)
        x.records[0].get('x.__jsmf__').should.equal(jsmfId)
      })
  })

  it('saves associated data as a node', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [], {x: Number}, {a: A})
    A.addReference('a', A, 1, undefined, undefined, B)
    const MM = new jsmf.Model('MM', {}, A)
    let a0 = new A()
      , a1 = new A()
      , b  = new B({x: 12})
    a0.addA(a1, b)
    b.a = a1
    const M = new jsmf.Model('M', MM, [a0,a1])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[x:a]-> (b) MATCH (c) WHERE x.__jsmf__ = c.__jsmf__ RETURN c'))
      .then( x => {
        x.records.length.should.equal(1)
      })
  })

  it('saved both side of opposite relationships', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('b', B, 1, 'a', -1)
    const MM = new jsmf.Model('MM', {}, [A,B])
    let a = new A()
      , b = new B()
    a.b = b
    const M = new jsmf.Model('M', MM, [a,b])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:b]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then(x  => x.records.length.should.equal(1))
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then(x  => x.records.length.should.equal(1))
  })

})

describe('load models', () => {

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('loads a simple class', () => {
    const modelId = uuid1
    const elemId = uuid2
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:Meta:Class {name: "A", __jsmf__: { elemId }})
                   CREATE (m)-[:elements]->(a)`
    const initDB = session.run(query, {modelId, elemId})
    return initDB
      .then(() => n.loadModelFromId(modelId))
      .then(x => {
        function createA() {
          let A = x.elements()[0]
          return new A()
        }
        (createA()).should.not.throw()
      })
  })

  it('loads a class with an attribute', () => {
    const elemId = uuid1
    const attrId = uuid2
    const modelId = uuid3
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { elemId }})
                   CREATE (attr:Meta:Attribute {name: "foo", primitiveType: "String", __jsmf__: { attrId }})
                   CREATE (m)-[:elements]->(c)
                   CREATE (c)-[:attributes]->(attr)`
    const initDB = session.run(query, {elemId, attrId, modelId})
    return initDB
      .then(() => n.loadModelFromId(modelId))
      .then(x => {
        function createA(y) {
          return function() {
            let A = x.classes.A[0]
            return new A({foo: y})
          }
        }
        (createA('test')).should.not.throw();
        (createA(12)).should.throw()
      })
  })

  it('loads a simple element', () => {
    const modelId = uuid1
    const elemId = uuid2
    const classId = uuid3
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, {elemId, modelId, classId})
    return initDB
      .then(() => n.loadModelFromId(uuid1))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        jsmf.jsmfId(x.modellingElements.A[0]).should.eql(uuid.parse(elemId))
      })
  })

  it('loads an element with a single property', () => {
    const params = {elemId: uuid1, elemX: 12, modelId: uuid2, classId: uuid3, attrId: uuid4}
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }, x: { elemX }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (attr:Meta:Attribute {name: "x", primitiveType: "Number", __jsmf__: { attrId }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (c)-[:atributes]->(attr)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, params)
    return initDB
      .then(() => n.loadModelFromId(params.modelId))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.elemX)
      })
  })

  it('loads an element with properties', () => {
    const params = {elemId: uuid1, x: 12, y: 'foo', modelId: uuid2, classId: uuid3, attrId: uuid4, attr2Id: uuid5}
    const query = `CREATE (m:Meta:Model {name: "test", __jsmf__: { modelId }})
                   CREATE (a:A {__jsmf__: { elemId }, x: { x }, y: { y }})
                   CREATE (c:Meta:Class {name: "A", __jsmf__: { classId }})
                   CREATE (attr:Meta:Attribute {name: "x", primitiveType: "Number", __jsmf__: { attrId }})
                   CREATE (attr2:Meta:Attribute {name: "x", primitiveType: "String", __jsmf__: { attr2Id }})
                   CREATE (m)-[:elements]->(a)
                   CREATE (c)-[:atributes]->(attr)
                   CREATE (c)-[:atributes]->(attr2)
                   CREATE (a)-[:conformsTo]->(c)`
    const initDB = session.run(query, params)
    return initDB
      .then(() => n.loadModelFromId(params.modelId))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.x)
        x.modellingElements.A[0].y.should.equal(params.y)
      })
  })
})

describe('Round trip transformation', () => {

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('works on a model with an element and a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('ref', A, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const params = { aId: uuid1.toLowerCase()
                   , bId: uuid2.toLowerCase()
                   }
    const a = new A()
        , b = new A()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(2)
        _.flatMap(x.modellingElements.A[0], 'ref').length.should.equal(1)
      })
  })

  it('resolves correctly opposite references', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1, 'back', -1)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const a = new A()
        , b = new B()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.A[0].ref.length.should.equal(1)
        x.modellingElements.B[0].back.length.should.equal(1)
      })
  })

  it('populate associated data', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
        , C = new jsmf.Class('C', [])
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const params = { aId: uuid1
                   , bId: uuid2
                   , cId: uuid3
                   }
    const a = new A()
        , b = new B()
        , c = new C()
    a.addRef(b, c)
    const M = new jsmf.Model('M', MM, [a, b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(3)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.A[0].getAssociated('ref').length.should.equal(1)
        x.modellingElements.B[0].back.length.should.equal(1)
      })
  })

  it('populate associated data with reference', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
        , C = new jsmf.Class('C', [], {}, {a: {type: A}})
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B, C])
    const a = new A()
        , b = new B()
        , c = new C()
    a.addRef(b, c)
    c.a = a
    const M = new jsmf.Model('M', MM, [a, b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(3)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.A[0].getAssociated('ref')[0].associated.should
          .equal(x.modellingElements.C[0])
        x.modellingElements.C[0].a[0].should.equal(x.modellingElements.A[0])
      })
  })

  it('resolves correctly inherited attributes', () => {
    const A = new jsmf.Class('A', [], {x: Number})
        , B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B])
    const b = new B({x: 12})
    const M = new jsmf.Model('M', MM, [b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(12)
      })
  })

  it('resolves correctly inherited references', () => {
    const A = new jsmf.Class('A', [])
        , C = new jsmf.Class('C', [])
    A.addReference('ref', C, -1, 'back', -1)
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B,C])
    const b = new B()
        , c = new C()
    b.ref = c
    const M = new jsmf.Model('M', MM, [b, c])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.C.length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].ref.length.should.equal(1)
        x.modellingElements.C[0].back.length.should.equal(1)
      })
  })


  it('solves multilevel inheritance', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [A,B])
    const a = new A({x : 12})
    const b = new B({x : 42})
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(M))))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(12)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(42)
      })
  })

  it('solves elements that are not in the model', () => {
    const A = new jsmf.Class('A', [])
        , B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const a = new A()
    const b = new B()
    a.ref = b
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.loadModelFromId(uuid.unparse(jsmf.jsmfId(MM))))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.Class.length.should.equal(1)
        x.classes.A[0].references.should.have.property('ref')
      })
  })

})

describe('load models by name', () => {

  before(initNeo4jConnector)
  beforeEach(cleanDB)
  after(closeNeo4j)

  it('loads a simple element model from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        jsmf.jsmfId(x[0].modellingElements.A[0]).should.eql(uuid.parse(uuid2))
      })
  })

  it('loads a simple modle element with attribute from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", primitiveType: "String"})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
      })
  })

  it('loads a simple model element with custom attribute from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", primitiveType: "MyString"})`, {uuid1, uuid2, uuid3})
    return initDB
      .then(() => n.loadModelFromName('M', t => t == 'MyString' ? jsmf.jsmfString : undefined))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
      })
  })

  it('loads a simple element with an enum attribute model from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: {value}})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {name: "foo", __jsmf__: {uuid4}})
       CREATE (at)-[:type]->(e:Meta:Enum {name: 'State', __jsmf__: {uuid5}})
       CREATE (e)-[:values]->(o:Meta:EnumValue {key: "toto", value: {value}, __jsmf__: {uuid6}})`,
        {uuid1, uuid2, uuid3, uuid4, uuid5, uuid6, value: 0})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql(0)
      })
  })

  it('loads a simple element with reference from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test"})-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (m)-[:elements]->(b:A {__jsmf__: {uuid4}, foo: "woot"})-[:conformsTo]->(c)
       CREATE (a)-[:ref]->(b)
       CREATE (c)-[:references]->(r:Meta:Reference {name: "ref", min: 1, max: 1, __jsmf__: {uuid5}})
       CREATE (r)-[:type]->(c)
      `, {uuid1, uuid2, uuid3, uuid4, uuid5})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(2)
        x[0].modellingElements.A.length.should.equal(2)
        _.flatMap(x[0].modellingElements.A, 'ref').should.matchAny(v => x[0].modellingElements.A.should.containEql(v))
      })
  })

  it('loads a model of a simple element with inherited attributes from name', () => {
    const initDB = session.run(
      `CREATE (m:Meta:Model {name: "M", __jsmf__: {uuid1} })-[:elements]->(a:A {__jsmf__: {uuid2}, foo: "test", bar: "ok"})
       CREATE (a)-[:conformsTo]->(c:Meta:Class {name: "A", __jsmf__: {uuid3}})
       CREATE (c)-[:attributes]->(at:Meta:Attribute {__jsmf__: {uuid4}, name: "foo", primitiveType: "String"})
       CREATE (c)-[:superClasses]->(s:Meta:Class {__jsmf__: {uuid5}, name: "B"})
       CREATE (s)-[:attributes]->(at2:Meta:Attribute {__jsmf__: {uuid6}, name: "bar", primitiveType: "String"})`, {uuid1, uuid2, uuid3, uuid4, uuid5, uuid6})
    return initDB
      .then(() => n.loadModelFromName('M'))
      .then(x => {
        x.length.should.equal(1)
        x[0].elements().length.should.equal(1)
        x[0].modellingElements.A.length.should.equal(1)
        x[0].modellingElements.A[0].foo.should.eql('test')
        x[0].modellingElements.A[0].bar.should.eql('ok')
      })
  })

})
