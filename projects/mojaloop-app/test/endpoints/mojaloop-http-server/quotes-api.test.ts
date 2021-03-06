import 'mocha'
import { v4 as uuid } from 'uuid'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as hapi from 'hapi'
import { MojaloopHttpEndpointManager } from '../../../src/endpoints/mojaloop/mojaloop-http-server'
import { MojaloopHttpEndpoint } from '../../../src/endpoints/mojaloop/mojaloop-http'
import { MojaloopHttpRequest, isQuotePostMessage, isQuotePutMessage, isQuoteGetRequest, isQuotePutErrorRequest } from '../../../src/types/mojaloop-packets'
import { AxiosResponse } from 'axios'
import { QuotesPostRequest, QuotesIDPutResponse, ErrorInformationObject } from '../../../src/types/mojaloop-models/models';
import { RequestMapEntry } from '../../../src/rules/track-requests-rule';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Mojaloop Http Endpoint Manager Quote API', function () {
  let endpointManager: MojaloopHttpEndpointManager
  let httpServer: hapi.Server

  const headers = {
    'fspiop-source': 'alice',
    'date': new Date(Date.now()).toUTCString(),
    'content-type': 'application/vnd.interoperability.quotes+json;version=1.0'
  }

  const postQuoteMessage: QuotesPostRequest = {
    amount: {
      amount: '100',
      currency: 'USD'
    },
    amountType: 'SEND',
    transferCurrency: 'USD',
    payee: {
      partyIdInfo: {
        partyIdType: '1',
        partyIdentifier: '1'
      }
    },
    payer: {
      partyIdInfo: {
        partyIdType: '1',
        partyIdentifier: '1'
      }
    },
    quoteId: uuid(),
    transactionId: uuid(),
    transactionType: {
      initiator: 'Payee',
      initiatorType: 'test',
      scenario: 'refund'
    }
  }

  const quotePutMessage: QuotesIDPutResponse = {
    condition: 'f5sqb7tBTWPd5Y8BDFdMm9BJR_MNI4isf8p8n4D5pHA',
    expiration: '2016-05-24T08:38:08.699-04:00',
    ilpPacket: 'testpacket',
    transferAmount: {
      amount: '100',
      currency: 'USD'
    }
  }

  const errorMessage: ErrorInformationObject = {
    errorInformation: {
      errorCode: 'test',
      errorDescription: 'test'
    }
  }

  const getStoredTransferById = (id: string) => {
    return {
      headers: {},
      body: {},
      sourcePeerId: 'test-peer1'
    }
  }

  const getStoredQuoteById = (id: string) => {
    return {
      headers,
      body: postQuoteMessage,
      sourcePeerId: 'test-peer2'
    }
  }

  const getStoredQuotePutById = (id: string) => {
    return {
      headers,
      body: postQuoteMessage,
      sourcePeerId: 'test-peer3'
    }
  }

  const mapOutgoingTransferToIncoming = (id: string) => {
    return {
      headers,
      body: postMessage,
      sourcePeerId: 'test-peer'
    }
  }

  beforeEach(function () {
    httpServer = new hapi.Server({
      host: '0.0.0.0',
      port: 7780
    })
    httpServer.start()
    endpointManager = new MojaloopHttpEndpointManager(httpServer, { getStoredTransferById, getStoredQuoteById, getStoredQuotePutById, mapOutgoingTransferToIncoming })
  })

  afterEach(function () {
    httpServer.stop()
  })

  describe('post quote', function () {
    it('returns a 202 on successful post', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { return {} as AxiosResponse })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'post',
        url: '/alice/quotes',
        payload: postQuoteMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
    })

    it('gives the endpoint a MojaloopHttpRequest with a body of type QuotesPostRequest', async function () {
      let endpointHttpRequest: MojaloopHttpRequest
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { 
        endpointHttpRequest = request
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'post',
        url: '/alice/quotes',
        payload: postQuoteMessage,
        headers
      })
  
      assert.equal(res.statusCode, 202)
      assert.isTrue(isQuotePostMessage(endpointHttpRequest!.body))
    })

    it('returns 500 if there is no endpoint for the participant', async function () {
      const res = await httpServer.inject({
        method: 'post',
        url: '/alice/quotes',
        payload: postQuoteMessage,
        headers
      })

      assert.equal(res.statusCode, 500)
    })

    it('uses the currency in the amount field to choose the usd account for alice', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      const getSpy = sinon.spy(endpointManager, 'get')
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => {
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
      endpointManager.set('alice-xof', endpoint)
  
      const res = await httpServer.inject({
        method: 'post',
        url: '/alice/quotes',
        payload: postQuoteMessage,
        headers
      })
  
      assert.equal(res.statusCode, 202)
      sinon.assert.calledWith(getSpy, 'alice-usd')
    })
  })

  describe('put quote', function () {
    it('returns a 202 on successful put', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { return {} as AxiosResponse })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${postQuoteMessage.quoteId}`,
        payload: quotePutMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
    })

    it('gives the endpoint a MojaloopHttpRequest with a body of type QuotesIdPutRequest', async function () {
      let endpointHttpRequest: MojaloopHttpRequest
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { 
        endpointHttpRequest = request
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${postQuoteMessage.quoteId}`,
        payload: quotePutMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
      assert.isTrue(isQuotePutMessage(endpointHttpRequest!.body))
      assert.equal(endpointHttpRequest!.objectId, postQuoteMessage.quoteId)
    })

    it('returns 500 if there is no endpoint for the participant', async function () {
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${uuid()}`,
        payload: quotePutMessage,
        headers
      })

      assert.equal(res.statusCode, 500)
    })

    it('uses the currency in the amount field to choose the usd account for alice', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      const getSpy = sinon.spy(endpointManager, 'get')
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => {
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${postQuoteMessage.quoteId}`,
        payload: quotePutMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
      sinon.assert.calledWith(getSpy, 'alice-usd')
    })
  })

  describe('get quotes', function () {
    it('returns 202 on successful get', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { return {} as AxiosResponse})
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'get',
        url: '/alice/quotes/' + postQuoteMessage.quoteId,
        payload: {},
        headers
      })
  
      assert.equal(res.statusCode, 202)
    })

    it('gives the endpoint a MojaloopHttpRequest of type TransferGetRequest', async function () {
      let endpointHttpRequest: MojaloopHttpRequest
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { 
        endpointHttpRequest = request
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'get',
        url: '/alice/quotes/' + postQuoteMessage.quoteId,
        payload: {},
        headers
      })
  
      assert.equal(res.statusCode, 202)
      assert.isTrue(isQuoteGetRequest(endpointHttpRequest!))
    })

    it('returns 500 if there is no endpoint for the participant', async function () {
      const res = await httpServer.inject({
        method: 'get',
        url: '/alice/quotes/' + uuid(),
        payload: {},
        headers
      })
  
      assert.equal(res.statusCode, 500)
    })

    it('uses the currency in the amount field of the stored quote to choose the usd account for alice', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      const getSpy = sinon.spy(endpointManager, 'get')
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => {
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'get',
        url: '/alice/quotes/' + postQuoteMessage.quoteId,
        payload: {},
        headers
      })

      assert.equal(res.statusCode, 202)
      sinon.assert.calledWith(getSpy, 'alice-usd')
    })
  })


  describe('put quote error', function () {
    it('returns 202 on successful put', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { return {} as AxiosResponse})
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${postQuoteMessage.quoteId}/error`,
        payload: errorMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
    })

    it('gives the endpoint a QuotePutErrorRequest', async function () {
      let endpointHttpRequest: MojaloopHttpRequest
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => { 
        endpointHttpRequest = request
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
  
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${postQuoteMessage.quoteId}/error`,
        payload: errorMessage,
        headers
      })
  
      assert.equal(res.statusCode, 202)
      assert.isTrue(isQuotePutErrorRequest(endpointHttpRequest!))
      assert.deepEqual(endpointHttpRequest!.body, errorMessage)
      assert.deepEqual(endpointHttpRequest!.objectId, postQuoteMessage.quoteId)
      assert.deepEqual(endpointHttpRequest!.objectType, 'quote')
    })

    it('returns 500 if there is no endpoint for the participant', async function () {
      const res = await httpServer.inject({
        method: 'put',
        url: `/alice/quotes/${uuid()}/error`,
        payload: errorMessage,
        headers
      })
  
      assert.equal(res.statusCode, 500)
    })

    it('uses the currency in the amount field of the stored quote to choose the usd account for alice', async function () {
      const endpoint = new MojaloopHttpEndpoint({ url: 'http://localhost:7781/alice' })
      const getSpy = sinon.spy(endpointManager, 'get')
      endpoint.setIncomingRequestHandler(async (request: MojaloopHttpRequest) => {
        return {} as AxiosResponse
       })
      endpointManager.set('alice-usd', endpoint)
      endpointManager.set('alice-xof', endpoint)

      const res = await httpServer.inject({
        method: 'put',
        url: '/alice/quotes/' + postQuoteMessage.quoteId + '/error',
        payload: errorMessage,
        headers
      })

      assert.equal(res.statusCode, 202)
      sinon.assert.calledWith(getSpy, 'alice-usd')
    })
  })
})