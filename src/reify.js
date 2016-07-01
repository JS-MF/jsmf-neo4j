/**
 *   Neo4J Connector
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet
*/

const neo4j = require('neo4j-driver').v1
    , _ = require('lodash')
    , jsmf = require('jsmf-core')
    , uuid = require('uuid')

const Meta = new jsmf.Class('Meta', [])

const EnumValue = new jsmf.Class('EnumValue', Meta, {key: String, value: jsmf.Any})
const Enum = new jsmf.Class('Enum', Meta,
  {name: {type: String, mandatory: true}},
  {values: {type: EnumValue, cardinality: jsmf.Cardinality.some}})

const Attribute = new jsmf.Class('Attribute', Meta,
    {name: {type: String, mandatory: true}, mandatory: Boolean, primitiveType: String},
    {type: {type: Enum, cardinality: jsmf.Cardinality.one}})
const Reference = new jsmf.Class('Reference', Meta,
    {name: {type: String, mandatory: true}, min: jsmf.Positive, max: jsmf.Positive, opposite: String})

const Class = new jsmf.Class('Class', Meta,
    {name: {type: String, mandatory: true}},
    {attributes: {type: Attribute}, references: {type: Reference}})
Class.addReference('superClasses', Class)

const Model = new jsmf.Class('Model', Meta, {name: {type: String, mandatory: true}}, {elements: {type: jsmf.Any}})


Reference.addReference('type', Class, jsmf.Cardinality.one)

function reifyEnum(e, mapping) {
  if (!jsmf.isJSMFEnum(e)) {return undefined}
  const cId = uuid.unparse(jsmf.jsmfId(e))
  const cache = mapping.get(cId)
  if (cache != undefined) { return cache }
  const result = new Enum(
    { name: e.__name
    , values: _(e).omit(['__name']).map((value, key) => new EnumValue({key, value})).value()
    })
  result.__jsmf__.uuid = jsmf.jsmfId(e)
  mapping.set(cId, result)
  return result
}

function reifyModel(m) {
  if (!(m instanceof jsmf.Model)) {return undefined}
  const result = new Model({name: m.__name})
  result.elements = _(m.modellingElements).flatten().value()
  result.__jsmf__.uuid = jsmf.jsmfId(m)
  result.__jsmf__.storeIn = m.__jsmf__.storeIn
  return result
}

function reifyClass(c, mapping, ownTypes) {
  if (!jsmf.isJSMFClass(c)) {return undefined}
  const cId = uuid.unparse(jsmf.jsmfId(c))
  const cache = mapping.get(cId)
  if (cache != undefined) { return cache }
  const result = new Class({name: c.__name})
  result.superClasses = _.map(c.superClasses, c => reifyClass(c, mapping, ownTypes))
  result.attributes = _.map(c.attributes, (a, name) => reifyAttribute(name, a, mapping, ownTypes))
  result.__jsmf__.uuid = jsmf.jsmfId(c)
  mapping.set(cId, result)
  result.references = _.map(c.references, (r, name) => reifyReference(name, r, mapping, ownTypes))
  result.__jsmf__.storeIn = c.__jsmf__.storeIn
  return result
}

function reifyAttribute(name, a, mapping, ownTypes) {
  const result = new Attribute({name, mandatory: a.mandatory})
  if (jsmf.isJSMFEnum(a.type)) {
    result.type = reifyEnum(a.type, mapping)
  } else {
    result.primitiveType = reifyPrimitiveType(a.type, ownTypes)
  }
  return result
}

function reifyReference(name, r, mapping, ownTypes) {
  return new Reference(
    { name
    , min: r.cardinality.min
    , max: r.cardinality.max
    , opposite: r.opposite
    , type: reifyClass(r.type, mapping, ownTypes)
    })
}

function reifyPrimitiveType(t, ownTypes) {
  return (ownTypes && ownTypes(t)) || stringifyType(t)
}

function stringifyType(t) {
  switch (t) {
  case jsmf.Number: return 'Number'
  case jsmf.Positive: return 'Positive'
  case jsmf.Negative: return 'Negative'
  case jsmf.String: return 'String'
  case jsmf.Boolean: return 'Boolean'
  case jsmf.Date: return 'Date'
  case jsmf.Array: return 'Array'
  case jsmf.Object: return 'Object'
  case jsmf.Any: return 'Any'
  default: if (t.typeName === 'Range') { return `Range(${t.min}, ${t.max})` }
    return 'UnknwonType'
  }
}

const jsmfMetamodel = new jsmf.Model('jsmfMetamodel', undefined, [Class, Meta], true)

module.exports = jsmf.modelExport(jsmfMetamodel)

_.assign(module.exports, {reifyEnum, reifyClass, reifyModel})
