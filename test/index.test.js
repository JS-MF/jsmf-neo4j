'use strict'

const should = require('should')
    , neo4j = require('neo4j-driver').v1
    , jsmf = require('jsmf-core')
    , n = require('../index')

const url = 'bolt://localhost'
const username = 'neo4j'
const password = 'neo4j'

let driver, session

function initNeo4jConnector(done) {
  driver = neo4j.driver(url, neo4j.auth.basic(username, password))
  session = driver.session()
  n(url, username, password)
  n.initStorage()

  session.run('MATCH (n) DETACH DELETE n').then(() => done())
}

function closeNeo4j() {
  driver.close()
  n.close()
}

describe('saveModel', () => {

  beforeEach(initNeo4jConnector)
  afterEach(closeNeo4j)

  it('saves element', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => x.records.length.should.equal(1))
  })

  it('is idempotent on two saves', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => n.saveModel(M))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => x.records.length.should.equal(1))
  })

  it('updates on second save', () => {
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

  it('changes uuid if duplicates', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    let b = new A({x: 24})
    b.__jsmf__.uuid = a.__jsmf__.uuid
    const M = new jsmf.Model('M', MM, [a, b])
    return n.saveModel(M)
      .then(() => n.saveModel(M))
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
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A:B:C {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves one attribute element', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12})
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a), x: a.x}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several attributes element', () => {
    const A = new jsmf.Class('A', [], {x: Number, y: String})
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A({x: 12, y: 'ahoy'})
    const M = new jsmf.Model('M', MM, [a])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}, x: {x}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a), x: a.x, y: a.y}))
      .then( x => x.records.length.should.equal(1))
  })

  it('saves several elements', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, A)
    let a = new A()
      , b = new A()
    const M = new jsmf.Model('M', MM, [a,b])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => x.records.length.should.equal(1))
      .then(() => session.run('MATCH (a:A {__jsmf__: {jsmfId}}) RETURN (a)', {jsmfId: jsmf.jsmfId(b)}))
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
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmf.jsmfId(a))
        x.records[0].get('b.__jsmf__').should.equal(jsmf.jsmfId(b))
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
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[:a]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmf.jsmfId(a))
        x.records[0].get('b.__jsmf__').should.equal(jsmf.jsmfId(b))
      })
      .then(() => session.run('MATCH (a) -[:b]-> (b) RETURN a.__jsmf__, b.__jsmf__', {jsmfId: jsmf.jsmfId(a)}))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('a.__jsmf__').should.equal(jsmf.jsmfId(a))
        x.records[0].get('b.__jsmf__').should.equal(jsmf.jsmfId(b))
      })
  })

  it('saves associated data attributes', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [], {x: Number})
    A.addReference('a', A, 1, undefined, undefined, B)
    const MM = new jsmf.Model('MM', {}, A)
    let a0 = new A()
      , a1 = new A()
      , b  = new B({x: 12})
    a0.addA(a1, b)
    const M = new jsmf.Model('M', MM, [a0,a1])
    return n.saveModel(M)
      .then(() => session.run('MATCH (a) -[x:a]-> (b) RETURN x.x, x.__jsmf__'))
      .then( x => {
        x.records.length.should.equal(1)
        x.records[0].get('x.x').should.equal(b.x)
        x.records[0].get('x.__jsmf__').should.equal(jsmf.jsmfId(b))
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

  beforeEach(initNeo4jConnector)
  afterEach(closeNeo4j)


  it('loads a simple element', () => {
    const A = new jsmf.Class('A', [])
    const MM = new jsmf.Model('MM', {}, [A])
    const elemId = 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
    const initDB = session.run(`CREATE (a:A {__jsmf__: { elemId }})`, {elemId})
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        jsmf.jsmfId(x.modellingElements.A[0]).should.equal(elemId)
      })
  })

  it('loads an element with a single property', () => {
    const A = new jsmf.Class('A', [], {x: Number})
    const MM = new jsmf.Model('MM', {}, [A])
    const params = {elemId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE', elemX: 12}
    const initDB = session.run(`CREATE (a:A {__jsmf__: { elemId }, x: { elemX }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.elemX)
      })
  })

  it('loads an element with properties', () => {
    const A = new jsmf.Class('A', [], {x: Number, y: String})
    const MM = new jsmf.Model('MM', {}, [A])
    const params = {elemId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE', x: 12, y: 'foo'}
    const initDB = session.run(`CREATE (a:A {__jsmf__: { elemId }, x: { x }, y: { y }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.x)
        x.modellingElements.A[0].y.should.equal(params.y)
      })
  })

  it('loads an element with a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('ref', A, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A {__jsmf__: { aId }})-[:ref]->(b:A {__jsmf__: { bId }})`, params)
    return initDB
      .then(x => x)
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(2)
        x.modellingElements.A[0].ref.length.should.equal(1)
      })
  })

  it('loads an element with a reference', () => {
    const A = new jsmf.Class('A', [])
    A.addReference('ref', A, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A {__jsmf__: { aId }})-[:ref]->(b:A {__jsmf__: { bId }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(2)
        x.modellingElements.A[0].ref.length.should.equal(1)
      })
  })

  it('resolves correctly opposite references', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1, 'back', -1)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A {__jsmf__: { aId }})-[:ref]->(b:B {__jsmf__: { bId }}) CREATE (a)<-[:back]-(b)`, params)
    return initDB
      .then(() => n.loadModel(MM))
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
    const B = new jsmf.Class('B', [])
    const C = new jsmf.Class('C', [])
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   , cId: 'CAFEEE-BEAFFF-BEAFFF-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A {__jsmf__: { aId }})-[:ref {__jsmf__: { cId }}]->(b:B {__jsmf__: { bId }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
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
    const B = new jsmf.Class('B', [])
    const C = new jsmf.Class('C', [], {}, {a: {type: A}})
    A.addReference('ref', B, -1, 'back', -1, C)
    const MM = new jsmf.Model('MM', {}, [A, B, C])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   , cId: 'CAFEEE-BEAFFF-BEAFFF-BABEEE'
                   }
    const dbInit =
      [ `CREATE (a:A {__jsmf__: { aId }})-[:ref {__jsmf__: { cId }}]->(b:B {__jsmf__: { bId }})`
      , `CREATE (d:C {__jsmf__: { cId }})-[:a]->(a)`
      ]
    const initDB = session.run(dbInit.join(' '), params)
    return initDB
      .then(() => n.loadModel(MM))
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
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B])
    const params = {elemId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE', elemX: 12}
    const initDB = session.run(`CREATE (a:B:A {__jsmf__: { elemId }, x: { elemX }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(1)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(params.elemX)
      })
  })

  it('resolves correctly inherited references', () => {
    const A = new jsmf.Class('A', [])
    const C = new jsmf.Class('C', [])
    A.addReference('ref', C, -1, 'back', -1)
    const B = new jsmf.Class('B', A)
    const MM = new jsmf.Model('MM', {}, [B,C])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A:B {__jsmf__: { aId }})-[:ref]->(b:C {__jsmf__: { bId }}) CREATE (a)<-[:back]-(b)`, params)
    return initDB
      .then(() => n.loadModel(MM))
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
    const params = {idA: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE', xA: 12, idB: 'BABEEE-CAFEEE-BABEEE-CAFEEE', xB: 42}
    const initDB = session.run(`CREATE (a:A {__jsmf__: { idA }, x: { xA }}) CREATE (b:B:A {__jsmf__: { idB }, x: { xB }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].x.should.equal(params.xA)
        x.modellingElements.B.length.should.equal(1)
        x.modellingElements.B[0].x.should.equal(params.xB)
      })
  })

  it('solves elements that are not in the model', () => {
    const A = new jsmf.Class('A', [])
    const B = new jsmf.Class('B', [])
    A.addReference('ref', B, -1)
    const MM = new jsmf.Model('MM', {}, [A])
    const params = { aId: 'CAFEEE-CAFEEE-CAFEEE-CAFEEE'
                   , bId: 'CAFEEE-BABEEE-CAFEEE-BABEEE'
                   }
    const initDB = session.run(`CREATE (a:A {__jsmf__: { aId }})-[:ref]->(b:B {__jsmf__: { bId }})`, params)
    return initDB
      .then(() => n.loadModel(MM))
      .then(x => {
        x.elements().length.should.equal(2)
        x.modellingElements.A.length.should.equal(1)
        x.modellingElements.A[0].ref.length.should.equal(1)
      })
  })
})
