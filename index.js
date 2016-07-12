/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet
*/

/* **************************************
TODO:
    - add logger
    - make a version with batch processing
    - read from DB
    - update nodes/model
*************************************** */
'use strict'

const neo4j = require('neo4j-driver').v1
    , _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , r = require('./src/reify')

let driver

module.exports = function init(url, user, password) {
  if (user !== undefined && password !== undefined) {
    driver = neo4j.driver(url, neo4j.auth.basic(user, password),  {trust: 'TRUST_ON_FIRST_USE', encrypted: true})
  } else if (user === undefined && password === undefined) {
    driver = neo4j.driver(url)
  } else  {
    throw new Error('Invalid user/password pair')
  }
}

module.exports.close = () => driver.close()

module.exports.initStorage = () => {
  const existence = 'CREATE CONSTRAINT ON (a:JSMF) ASSERT exists(a.__jsmf__)'
  const uniqueness = 'CREATE CONSTRAINT ON (a:JSMF) ASSERT a.__jsmf__ IS UNIQUE'
  const session = driver.session()
  session.run([existence, uniqueness].join(' '))
}

module.exports.saveModel = function saveModel(m, ownTypes) {
  const reified = new Map()
  const rawElements = gatherElements(m)
  const elements = _.flatMap(rawElements, e => reifyMetaElement(e, reified, ownTypes))
  const session = driver.session()
  return saveElements(elements, new Map(), reified, ownTypes, session)
    .then(() => session.close())
}

function saveElements(elements, elemMap, reified, ownTypes, session) {
  return saveAttributes(elements, elemMap, reified, ownTypes, session)
    .then(() => saveRelationships(elements, elemMap, reified, ownTypes, session))
}

function gatherElements(m) {
  if (!(m instanceof jsmf.Model)) { return []}
  const result = m.elements()
  result.push(m)
  const mm = m.referenceModel
  return mm instanceof jsmf.Model
    ? result.concat(gatherElements(mm))
    : result
}

module.exports.loadModel = function loadModel(mm, session) {
  const mySession = session || driver.session()
  const classes = _.map(mm.classes, x => x[0])
  return Promise.all(_.map(classes, k => loadElements(k, mySession)))
    .then(elementsByClass =>
      _.flatMap(elementsByClass, elements => {
        const cls = elements[0]
        const records = elements[1].records
        return _.flatMap(records, x => refillAttributes(cls, x.get('a')))
      })
    )
    .then(elements => filterClassHierarchy(elements))
    .then(elements => new Map(_.map(elements, e => [uuid.unparse(jsmf.jsmfId(e)), e])))
    .then(elements => refillReferences(classes, elements, mySession))
    .then(values => {
      if (session !== mySession) {mySession.close()}
      return new jsmf.Model('LoadedModel', mm, Array.from(values.values()))
    })
}

module.exports.loadModelFromName = function loadModelFromName(name, ownTypes) {
  const session = driver.session()
  let modelElements, nodesByModel, classesMap
  return findModelsIdByName(session, name)
    .then(mIds => Promise.all(_.map(mIds, mId => getModelNodes(session, mId))))
    .then(mes => {
      modelElements = _.flatMap(mes, e => e[1])
      nodesByModel = _(mes).groupBy(e => e[0]).mapValues(es => _.flatMap(es, e => e[1])).value()
    })
    .then(() => gatherMetaElementsIds(modelElements))
    .then(me => resolveMetaElements(session, me, ownTypes))
    .then(me => {
      classesMap = me
      return _.mapValues(nodesByModel, es =>
        _(es)
          .map(e => [e.element, me.get(e.class.properties.__jsmf__)])
          .map(e => hydrateObject(e[0], e[1], me))
          .value()
      )
    })
    .then(elems => refillReferences(Array.from(classesMap.values()), elems, session))
    .then(elems => new jsmf.Model(name,
      Array.from(classesMap.values()),
      _(elems).values().flatten().value()))
}

function classesById(mm) {
  const knownElements = mm
    ? []
    : _.map(mm.elements(), e => [jsmf.jsmfId(e), e])
  return new Map(knownElements)
}

function findModelsIdByName(session, name) {
  const query =
    ` MATCH (m:Meta:Model {name: {name}})
      RETURN m.__jsmf__ AS jsmfId`
  return session.run(query, {name}).then(result => _.map(result.records, x => x.get('jsmfId')))
}

function getModelNodes(session, mId) {
  const query =
    ` MATCH (m:Meta:Model {__jsmf__: {mId}})-[:elements]->(e)
      OPTIONAL MATCH (e)-[:conformsTo]->(c)
      RETURN e, c`
  return session.run(query, {mId})
    .then(result => [mId, _.map(result.records, x => ({element: x.get('e'), class: x.get('c')}))])
}

function gatherMetaElementsIds(elemAndDescriptors) {
  return _.reduce(
    elemAndDescriptors,
    (acc, e) => e.class ? addClass(acc, e.class.properties.__jsmf__) : addClass(acc, e.properties.__jsmf__),
    new Set())
}

function addClass(s, e) {
  s.add(e)
  return s
}

function resolveMetaElements(session, idSet, ownTypes) {
  return loadModelByIds(session, idSet, r.jsmfMetamodel)
    .then(es => _.reduce(es, (cache, e) => disembodyStuff(e, ownTypes, cache), new Map()))
    .then(res => new Map(_.map(Array.from(res), kv => [uuid.unparse(jsmf.jsmfId(kv[0])), kv[1]])))
}

function loadModelByIds(session, idSet, jsmfMM) {
  return module.exports.loadModel(jsmfMM, session)
    .then(m => m.elements())
    .then(es => _.filter(es, e => idSet.has(uuid.unparse(jsmf.jsmfId(e)))))
}

function hydrateObject(e, cls, classMap) {
  return cls === undefined
    ? classMap.get(uuid.unparse(e.properties.__jsmf__))
    : refillAttributes(cls, e)
}

function disembodyStuff(e, ownTypes, cache) {
  const cached = cache.get(jsmf.jsmfId(e))
  if (!cached) {
    const c = e.conformsTo()
    let result
    if (c === r.Class) { result = r.disembodyClass(e, cache, ownTypes) }
    else if (c === r.Enum)  { result = r.disembodyEnum(e, cache) }
    else if (c === r.Model)  { result = r.disembodyModel(e, cache) }
    else { throw new Error("unkown element c") }
    cache.set(e, result)
  }
  return cache
}

function loadElements(cls, session) {
  const query = `MATCH (a:${cls.__name}) RETURN (a)`
  return session.run(query).then(x => [cls, x])
}

function refillAttributes(cls, e) {
  const res = cls.newInstance()
  _.forEach(cls.getAllAttributes(), (t, x) => {res[x] = e.properties[x]})
  try {res.__jsmf__.uuid = uuid.parse(e.properties.__jsmf__)} catch (err) {}
  setAsStored(res)
  return res
}

function setAsStored(e) {
  e.__jsmf__.storedIn = driver._url
}

function filterClassHierarchy(elements) {
  const res = _.reduce(elements, (acc, e) => checkElement(acc, e), new Map())
  return Array.from(res.values())
}

function checkElement(m, elem) {
  const elemId = uuid.unparse(jsmf.jsmfId(elem))
  const old = m.get(elemId)
  if (old === undefined) { m.set(elemId, elem) }
  else {
    const oldClasses = old.conformsTo().getInheritanceChain()
    if (!_.includes(oldClasses, elem.conformsTo())) {
      m.set(elemId, elem)
    }
  }
  return m
}

function refillReferences(classes, elements, session) {
  const silentProperties = new Set()
  return Promise.all(
      _(classes).flatMap(x => _.map(x.getAllReferences(), (ref, refName) => [x, ref, refName]))
            .map(x => refillReference(x[2], x[0], x[1], elements, silentProperties, session))
            .value()).then(() => elements)
}

function refillReference(refName, cls, ref, elements, silentProperties, session) {
  if (silentProperties.has(refName)) { return undefined }
  silentProperties.add(refName)
  if (ref.opposite != undefined) { silentProperties.add(ref.opposite)}
  const query = `MATCH (s:${cls.__name})-[a:${refName}]->(t:${ref.type.__name}) RETURN s, t, a`
  return session.run(query)
    .then(res => _.map(res.records,
                  rec => resolveReference(refName, cls, rec.get('s'),
                                          ref.type, rec.get('t'),
                                          ref.associated, rec.get('a'),
                                          elements)))
}

function resolveReference(name, srcClass, s, targetClass, t, associatedClass, a, elements) {
  const source = resolveElement(srcClass, s, elements)
  const target = resolveElement(targetClass, t, elements)
  const setterName = 'add' + name[0].toUpperCase() + name.slice(1)
  if (!_.isEmpty(a.properties)) {
    const associated = resolveElement(associatedClass, a, elements)
    source[setterName](target, associated)
  } else {
    source[setterName](target)
  }
}

function resolveElement(cls, e, elements) {
  const key = e.properties.__jsmf__
  let res = elements.get(key)
  if (!res) {
    res = refillAttributes(cls, e)
    elements.set(key, res)
  }
  return res
}

function saveAttributes(es, elemMap, reified, ownTypes, session) {
  return Promise.all(_.map(es, x => saveAttribute(x, reified, ownTypes, session)))
    .then(vs => _.reduce(vs, (acc, v) => {acc.set(v[0], v[1]); return acc}, elemMap))
}

function saveAttribute(elt, reified, ownTypes, session) {
  const e = reified.get(elt) || elt
  const dry = dryElement(e, ownTypes)
  const classes = _.map(e.conformsTo().getInheritanceChain(), '__name')
  classes.push('JSMF')
  if (e.__jsmf__.storedIn === driver._url) {
    const clean = 'MATCH (x {__jsmf__: {jsmfId}}) DETACH DELETE x'
    const update = `MERGE (x:${classes.join(':')} {__jsmf__: {jsmfId}}) SET x = {params} RETURN (x)`
    return session.run(clean, {jsmfId: dry.__jsmf__})
      .then(() => session.run(update, {params: dry, jsmfId: dry.__jsmf__}))
      .then(v => { setAsStored(e); return [e, v.records[0].get(0).identity]})
      .catch(err => Promise.reject(new Error(`Error with element: ${dry}`)))
  } else {
    const query = `CREATE (x:${classes.join(':')} {params}) RETURN (x)`
    return session.run(query, {params: dry})
      .catch(() => storeDuplicatedIdElement(classes, e, dry, session))
      .then(v => { setAsStored(e); return [e, v.records[0].get(0).identity]})
      .catch(err => Promise.reject(new Error(`Error with element: ${dry}`)))
  }
}

function storeDuplicatedIdElement(classes, e, dry, session) {
  const newId = jsmf.generateId()
  e.__jsmf__.uuid = newId
  dry.__jsmf__ = uuid.unparse(newId)
  const query = `CREATE (x:${classes.join(':')} {params}) RETURN (x)`
  return session.run(query, {params: dry})
    .then(v => { setAsStored(e); return [e, v.records[0].get(0).identity]})
    .catch(() => storeDuplicatedIdElement(classes, e, dry, session))
}

function saveRelationships(es, elemMap, reified, ownTypes, session) {
  const relations = _.flatMap(es, e => saveElemRelationships(e, elemMap, reified, ownTypes, session))
  return Promise.all(relations)
}

function saveElemRelationships(elt, elemMap, reified, ownTypes, session) {
  const e = reified.get(uuid.unparse(jsmf.jsmfId(elt))) || elt
  const references = e.conformsTo().getAllReferences()
  const result = _.flatMap(references, (v, r) => saveElemRelationship(e, r, elemMap, reified, ownTypes, session))
  const ct = e.conformsTo()
  if (jsmf.isJSMFClass(ct) && !_.includes(ct.superClasses, r.Meta)) {
    result.push(saveRelationship(e, 'conformsTo', ct, undefined, elemMap, reified, ownTypes, session))
  }
  return result
}

function saveElemRelationship(e, ref, elemMap, reified, ownTypes, session) {
  const associated = new Map(_.map(e.getAssociated(ref), a => [a.elem, a.associated]))
  const referenced = e[ref]
  return _.map(referenced, t => saveRelationship(e, ref, t, associated.get(t), elemMap, reified, ownTypes, session))
}

function saveRelationship(source, ref, target, associated, elemMap, reified, ownTypes, session) {
  const statements = [ 'MATCH (s) WHERE id(s) in { sourceId }'
                     , 'MATCH (t) WHERE id(t) in { targetId }'
                     , `CREATE (s) -[r:${ref}${associated ? ' { associated }' : ''}]-> (t)`
                     , 'RETURN r'
                     ]
  return Promise.all(_.map([source, associated, target], e => resolveId(e, elemMap, reified, ownTypes, session)))
    .then(ids => {
      if (ids[2] === undefined) {
        console.log(target)
        console.log(ids[2])
      }
      return Object.assign({sourceId: ids[0], targetId: ids[2]}, associated!==undefined?{associated: dryElement(associated)}:{})
    })
    .then(params => session.run(statements.join(' '), params))
}

function resolveId(e, elemMap, reified, ownTypes, session) {
  if (e === undefined) {return Promise.resolve(undefined)}
  let elem = reified.get(uuid.unparse(jsmf.jsmfId(e))) || e
  const elemId = elemMap.get(elem)
  if (elemId) {return Promise.resolve(elemId)}
  const re = reifyMetaElement(e, reified, ownTypes)
  return saveElements(re, elemMap, reified, ownTypes, session)
    .then(() => {
      elem = reified.get(uuid.unparse(jsmf.jsmfId(e))) || e
      return elemMap.get(elem)
    })
}

function dryElement(e) {
  const attributes = e.conformsTo().getAllAttributes()
  const jid = uuid.unparse(jsmf.jsmfId(e))
  return _.reduce(attributes,
    function (res, a, k) {
      if (e[k] !== undefined) { res[k] = e[k] }
      return res
    },
    {__jsmf__: jid})
}

function reifyMetaElement(elt, reified, ownTypes) {
  const cached = reified.get(uuid.unparse(jsmf.jsmfId(elt)))
  if (cached) {return cached}
  const rModel = r.reifyModel(elt, reified, ownTypes)
  if (rModel) {return [rModel]}
  const rClass = r.reifyClass(elt, reified, ownTypes)
  if (rClass) {return (new jsmf.Model('', undefined, rClass, true)).elements()}
  const rEnum = r.reifyEnum(elt, reified, ownTypes)
  if (rEnum) {return (new jsmf.Model('', undefined, rEnum, true)).elements()}
  return [elt]
}
