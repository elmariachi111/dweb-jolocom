import * as http from 'http'
import { credentialRequirements, serviceUrl,password, seed  } from './config'
import { Express } from 'express'
import { extractDataFromClaims } from './utils'
import { RedisApi } from './types'
import { JSONWebToken } from 'jolocom-lib/js/interactionTokens/JSONWebToken'
import { IdentityWallet } from 'jolocom-lib/js/identityWallet/identityWallet'
import { keyIdToDid } from 'jolocom-lib/js/utils/helper'
import { CredentialResponse } from 'jolocom-lib/js/interactionTokens/credentialResponse'
import { CredentialOffer } from 'jolocom-lib/js/interactionTokens/credentialOffer'
import { JolocomLib } from 'jolocom-lib'
import { CredentialRequest } from 'jolocom-lib/js/interactionTokens/credentialRequest'

import { DbWatcher } from './dbWatcher'
import { configureRedisClient } from './redis'
import { configureSockets } from './sockets'
import { resolve } from 'path';
import { SSO } from 'jolocom-lib/js/sso/sso'

const { getAsync, setAsync, delAsync } = configureRedisClient()
const registry = JolocomLib.registries.jolocom.create()
const vaultedKeyProvider = new JolocomLib.KeyProvider(seed, password)

module.exports = async (expressApp: Express, server: http.Server) => {
    
  const identityWallet = await registry.authenticate(vaultedKeyProvider, {derivationPath: JolocomLib.KeyTypes.jolocomIdentityKey, encryptionPass: password})

    configureRoutes(expressApp, {setAsync, getAsync, delAsync}, identityWallet, password)
    configureSockets(server, identityWallet, password, new DbWatcher(getAsync), {getAsync, setAsync, delAsync}) 
    return identityWallet
}

const configureRoutes = (app: Express, redisApi: RedisApi, iw: IdentityWallet, password: string) => {

  const { setAsync, getAsync } = redisApi
  /**
   * An authentication endpoint route for deep linking for demo-sso-mobile;
   */
  app.get('/mobile/credentialRequest', async (req, res, next) => {
    
    try {
      const credentialRequest = await iw.create.interactionTokens.request.share(
        {
          callbackURL: 'demosso://authenticate/',
          credentialRequirements
        },
        password
      )

      const jwtCR = credentialRequest.encode()
      res.send(jwtCR)
    } catch (err) {
      next(err)
    }
  })

  /**
   * An endpoint route for deep linking for demo-sso-mobile to start the credential receive flow;
   */

  app.get('/mobile/credentialOfferRequest', async (req, res, next) => {
    try {
      const credentialOfferRequest = await iw.create.interactionTokens.request.offer(
        {
          callbackURL: `${serviceUrl}/credentialReceive/`,
          instant: true,
          requestedInput: {}
        },
        password
      )

      const jwtCR = credentialOfferRequest.encode()
      res.send(jwtCR)
    } catch (err) {
      next(err)
    }
  })

  /**
   * Route which expects the credential response from user
   */

  app.post('/authentication/:clientId', async (req, res, next) => {
    try {
      const { clientId } = req.params    
      const { token } = req.body

      const localRecord = await getAsync(clientId)
      const encodedRequest: string = JSON.parse(localRecord).request

      const request: JSONWebToken<CredentialRequest> = JolocomLib.parse.interactionToken.fromJWT(encodedRequest)
      const response: JSONWebToken<CredentialResponse> = JolocomLib.parse.interactionToken.fromJWT(token)

      await iw.validateJWT(response, request)

      const userData = {
        ...extractDataFromClaims(response.interactionToken),
        did: keyIdToDid(response.issuer),
        status: 'success'
      }

      await setAsync(clientId, JSON.stringify({ status: 'success', data: userData }))

      res.json('OK')
    } catch (err) {
      next(err)
    }
  })

  /**
   * Route to get the credential offer request (broadcast)
   */

  app.get('/credentialOffer', async (req, res, next) => {
    try {
      const credOffer = await iw.create.interactionTokens.request.offer(
        {
          instant: true,
          requestedInput: {},
          callbackURL: `${serviceUrl}/credentialReceive/`
        },
        password
      )

      res.json({ token: credOffer.encode() })
    } catch (err) {
      next(err)
    }
  })

  /**
   * Route which expects the credential offer response from user
   * and sends an encoded signed credential
   */

  app.post('/credentialReceive', async (req, res, next) => {
    const { token } = req.body

    const credentialOfferResponse = JSONWebToken.decode<CredentialOffer>(token)

    try {
      await iw.validateJWT(credentialOfferResponse)

      const tinkererToken = await iw.create.signedCredential(
        {
          metadata: {
            type: ['Credential', 'ProofOfTinkererCredential'],
            name: 'Tinkerer',
            context: [
              {
                ProofOfTinkererCredential: 'https://identity.jolocom.com/terms/ProofOfTinkererCredential'
              }
            ]
          },
          claim: {
            note:
              'Thank you for your participation and contribution our ongoing efforts to make self sovereign identity a reality'
          },
          subject: keyIdToDid(credentialOfferResponse.issuer)
        },
        password
      )

      const credentialReceive = await iw.create.interactionTokens.response.issue(
        {
          signedCredentials: [tinkererToken.toJSON()]
        },
        password,
        credentialOfferResponse
      )

      res.json({ token: credentialReceive.encode() })
    } catch (err) {
      next(err)
    }
  })
}