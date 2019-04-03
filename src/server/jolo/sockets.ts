import { SSO } from 'jolocom-lib/js/sso/sso'
import io from 'socket.io'
import { credentialRequirements, serviceUrl } from './config'
import * as http from 'http'
import { DbWatcher } from './dbWatcher'
import { IdentityWallet } from 'jolocom-lib/js/identityWallet/identityWallet'
import { RedisApi } from './types'
const SHA3 = require('sha3')

export const configureSockets = (
  server: http.Server,
  identityWallet: IdentityWallet,
  password: string,
  dbWatcher: DbWatcher,
  redisApi: RedisApi
) => {
  const { getAsync, delAsync } = redisApi

  const baseSocket = io(server).origins('*:*')

  const authQrCodeSocket = baseSocket.of('/qr-code')
  const receiveQrCodeSocket = baseSocket.of('/qr-receive')
  const dataSocket = baseSocket.of('/sso-status')
  
  const testSocket = baseSocket.of('/hu');
  testSocket.on('connection', socket => {
      console.log("hu")
  })

  receiveQrCodeSocket.on('connection', async socket => {
    const { did, answer } = socket.handshake.query

    const didHash = SHA3.SHA3Hash()
    didHash.update(did)
    await redisApi.setAsync(`ans:${didHash.digest('hex')}`, answer)

    const credOfferRequest = await identityWallet.create.interactionTokens.request.offer(
      {
        instant: true,
        requestedInput: {},
        callbackURL: `${serviceUrl}/credentialReceive/`
      },
      password
    )

    console.log(credOfferRequest.encode())
    const qrCode = await new SSO().JWTtoQR(credOfferRequest.encode())
    socket.emit(did, qrCode)
  })

  /**
   * @description Used by the frontend to request credential request QR codes
   * @param {string} userId - The session identifier
   * @emits qrCode
   */

  authQrCodeSocket.on('connection', async socket => {
    
    const { userId } = socket.handshake.query
    console.log(userId);

    const callbackURL = `${serviceUrl}/authentication/${userId}`
    const credentialRequest = await identityWallet.create.interactionTokens.request.share(
      {
        callbackURL,
        credentialRequirements
      },
      password
    )

    /** Encoded credential request is saved for validation purposes later */
    await redisApi.setAsync(userId, JSON.stringify({ userId, request: credentialRequest.encode(), status: 'pending' }))
    const qrCode = await new SSO().JWTtoQR(credentialRequest.encode())

    console.log(`[DEBUG] : JWT for ${userId} : ${credentialRequest.encode()}`)
    socket.emit(userId, qrCode)
  })

  dataSocket.on('connection', async socket => {
    const { userId } = socket.handshake.query
    console.log(`sockets.ts: waiting until ${userId} logs in`)

    dbWatcher.addSubscription(userId)
    dbWatcher.on(userId, async () => {
      const userData = await getAsync(userId)
      await delAsync(userId)
      socket.emit(userId, userData)
    })
  })
}