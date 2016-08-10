/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : N. Biri, J.S. Sottet
*/

/* **************************************
TODO:
    - add logger
    - make a version with batch processing
    - read from DB
    - update nodes/model
*************************************** */
'use strict'

const _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')
    , r = require('./reify')

module.exports.loadModelFromName = function loadModelFromName(name, ownTypes, driver) {
  const session = driver.session()
  let nodesByModel, modelElements
  return findModelsByName(session, name)
    .then(mNodes => Promise.all(_.map(mNodes, mNode => getModelNodes(session, mNode.get('m')))))
    .then(mes => {
      modelElements = _.flatMap(mes, e => e[1])
      nodesByModel = _(mes).reduce((acc, e) => {
        const modelNodes = acc.get(e[0]) || []
        acc.set(e[0], modelNodes.concat(e[1]))
        return acc
      }, new Map())
    })
    .then(() => gatherMetaElementsIds(modelElements))
    .then(me => resolveMetaElements(session, me, ownTypes, driver))
    .then(mm => Promise.all(_.map(Array.from(nodesByModel.entries()), x => resolveModel(x[0], x[1], mm, session, driver))))
}

module.exports.loadModelFromId = function loadModelFromId(mId, ownTypes, driver) {
  const session = driver.session()
  let modelNode, modelElements
  return findModelsById(session, mId)
    .then(mNode => modelNode = mNode.get('m'))
    .then(() => getModelNodes(session, modelNode))
    .then(nodes => {modelElements = nodes[1]; return gatherMetaElementsIds(modelElements)})
    .then(me => resolveMetaElements(session, me, ownTypes, driver))
    .then(mm => resolveModel(modelNode, modelElements, mm, session, driver))
}

module.exports.loadModel = function loadModel(mm, session, driver) {
  const mySession = session || driver.session()
  const classes = _.map(mm.classes, x => x[0])
  return Promise.all(_.map(classes, k => loadElements(k, mySession)))
    .then(elementsByClass =>
      _.flatMap(elementsByClass, elements => {
        const cls = elements[0]
        const records = elements[1].records
        return _.flatMap(records, x => refillAttributes(cls, x.get('a'), driver))
      })
    )
    .then(elements => filterClassHierarchy(elements))
    .then(elements => new Map(_.map(elements, e => [uuid.unparse(jsmf.jsmfId(e)), e])))
    .then(elements => refillReferences(classes, elements, mySession, driver))
    .then(values => {
      if (session !== mySession) {mySession.close()}
      return new jsmf.Model('LoadedModel', mm, Array.from(values.values()))
    })
}

function resolveModel(modelNode, elements, metamodel, session, driver) {
  const mmValues = Array.from(metamodel.values())
  const hydratedElements = new Map(
    _(elements)
      .map(e => [e.element, metamodel.get(e.class.properties.__jsmf__)])
      .map(e => hydrateObject(e[0], e[1], metamodel, driver))
      .map(e => [uuid.unparse(jsmf.jsmfId(e)), e])
      .value())
  return refillReferences(mmValues, hydratedElements, session, driver)
    .then(elems => Array.from(elems.values()))
    .then(elems => new jsmf.Model(modelNode.properties.name,
      mmValues,
      _(elems).values().flatten().value()))
    .then(m => {m.__jsmf__.uuid = modelNode.properties.__jsmf__; return m})
}

function findModelsById(session, mId) {
  const query =
    `MATCH (m:Meta:Model {__jsmf__: {mId}})
     RETURN (m)`
  return session.run(query, {mId}).then(result => result.records[0])
}

function findModelsByName(session, name) {
  const query =
    `MATCH (m:Meta:Model {name: {name}})
     RETURN (m)`
  return session.run(query, {name}).then(result => result.records)
}

function getModelNodes(session, mId) {
  const query =
    `MATCH (m:Meta:Model {__jsmf__: {mId}})-[:elements]->(e)
     OPTIONAL MATCH (e)-[:conformsTo]->(c)
     RETURN e, c`
  return session.run(query, {mId})
    .then(result => [mId, _.map(result.records, x => ({element: x.get('e'), class: x.get('c')}))])
}

function getModelNodes(session, mNode) {
  const mId = mNode.properties.__jsmf__
  const query =
    `MATCH (m:Meta:Model {__jsmf__: {mId}})-[:elements]->(e)
     OPTIONAL MATCH (e)-[:conformsTo]->(c)
     RETURN e, c`
  return session.run(query, {mId})
    .then(result => [mNode, _.map(result.records, x => ({element: x.get('e'), class: x.get('c')}))])
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

function resolveMetaElements(session, idSet, ownTypes, driver) {
  return loadModelByIds(session, idSet, r.jsmfMetamodel, driver)
    .then(es => _.reduce(es, (cache, e) => disembodyStuff(e, ownTypes, cache), new Map()))
    .then(res => new Map(_.map(Array.from(res), kv => [uuid.unparse(jsmf.jsmfId(kv[0])), kv[1]])))
}

function loadModelByIds(session, idSet, jsmfMM, driver) {
  return module.exports.loadModel(jsmfMM, session, driver)
    .then(m => m.elements())
    .then(es => _.filter(es, e => idSet.has(uuid.unparse(jsmf.jsmfId(e)))))
}

function hydrateObject(e, cls, classMap, driver) {
  return cls === undefined
    ? classMap.get(uuid.unparse(e.properties.__jsmf__))
    : refillAttributes(cls, e, driver)
}

function disembodyStuff(e, ownTypes, cache) {
  const cached = cache.get(jsmf.jsmfId(e))
  if (!cached) {
    const c = e.conformsTo()
    if (c === r.Class) { r.disembodyClass(e, cache, ownTypes) }
    else if (c === r.Enum)  { r.disembodyEnum(e, cache) }
    else if (c === r.Model) { r.disembodyModel(e, cache) }
    else { return cache }
  }
  return cache
}

function loadElements(cls, session) {
  const query = `MATCH (a:${cls.__name}) RETURN (a)`
  return session.run(query).then(x => [cls, x])
}

function refillAttributes(cls, e, driver) {
  const res = cls.newInstance()
  _.forEach(cls.getAllAttributes(), (t, x) => {res[x] = e.properties[x]})
  try {res.__jsmf__.uuid = uuid.parse(e.properties.__jsmf__)} catch (err) {}
  setAsStored(res, driver)
  return res
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

function refillReferences(classes, elements, session, driver) {
  const silentProperties = new Map()
  return Promise.all(
      _(classes).filter(jsmf.isJSMFClass)
            .flatMap(x => _.map(x.getAllReferences(), (ref, refName) => [x, ref, refName]))
            .map(x => refillReference(x[2], x[0], x[1], elements, silentProperties, session, driver))
            .value()).then(() => elements)
}

function refillReference(refName, cls, ref, elements, silentProperties, session, driver) {
  const clsSilentProperties = silentProperties.get(cls) || new Set()
  if  (clsSilentProperties.has(refName)) { return undefined }
  if (ref.opposite != undefined) { silentProperties.set(ref.type, clsSilentProperties.add(ref.opposite)) }
  const query = `MATCH (s:${cls.__name})-[a:${refName}]->(t:${ref.type.__name}) RETURN s, t, a`
  return session.run(query)
    .then(res => _.map(res.records,
                  rec => resolveReference(refName, cls, rec.get('s'),
                                          ref.type, rec.get('t'),
                                          ref.associated, rec.get('a'),
                                          elements,
                                          driver)))
}

function resolveReference(name, srcClass, s, targetClass, t, associatedClass, a, elements, driver) {
  const source = resolveElement(srcClass, s, elements, driver)
  const target = resolveElement(targetClass, t, elements, driver)
  const setterName = 'add' + _.upperFirst(name)
  if (_.isEmpty(a.properties)) {
    source[setterName](target)
  } else {
    const associated = resolveElement(associatedClass, a, elements, driver)
    source[setterName](target, associated)
  }
}

function resolveElement(cls, e, elements, driver) {
  const key = e.properties.__jsmf__
  let res = elements.get(key)
  if (!res) {
    res = refillAttributes(cls, e, driver)
    elements.set(key, res)
  }
  return res
}

function setAsStored(e, driver) {
  e.__jsmf__.storedIn = driver._url
}


