import { mapState, mapGetters } from 'vuex'
import RootState from '@vue-storefront/core/types/RootState'
import io from 'socket.io-client'

const randomString = (length: number) => {
  return Math.random()
    .toString(36)
    .substr(2, length)
}

export const PersonalDetails = {
  name: 'PersonalDetails',
  props: {
    isActive: {
      type: Boolean,
      required: true
    },
    focusedField: {
      type: String,
      required: false
    }
  },
  data () {
    return {
      isFilled: false,
      personalDetails: this.$store.state.checkout.personalDetails,
      createAccount: false,
      acceptConditions: false,
      password: '',
      rPassword: '',
      isValidationError: false
    }
  },
  computed: {
    ...mapState({
      currentUser: (state: RootState) => state.user.current
    }),
    ...mapGetters({
      isVirtualCart: 'cart/isVirtualCart'
    })
  },
  methods: {
    onLoggedIn (receivedData) {
      this.personalDetails = {
        firstName: receivedData.firstname,
        lastName: receivedData.lastname,
        emailAddress: receivedData.email
      }
    },
    sendDataToCheckout () {
      if (this.createAccount) {
        this.personalDetails.password = this.password
        this.personalDetails.createAccount = true
      } else {
        this.personalDetails.createAccount = false
      }
      this.$bus.$emit('checkout-after-personalDetails', this.personalDetails, this.$v)
      this.isFilled = true
      this.isValidationError = false
    },
    edit () {
      if (this.isFilled) {
        this.$bus.$emit('checkout-before-edit', 'personalDetails')
        this.isFilled = false
      }
    },
    gotoAccount () {
      this.$bus.$emit('modal-show', 'modal-signup')
    },
    async continueWithJolo () {
      console.log('called jolo.')
      const randomId = randomString(8);

      this.getQrCode(randomId).then(image => {
        this.$bus.$emit('modal-show', 'modal-jolo-user', null, {image: image})
        this.awaitUserData(randomId).then(data => {
          const parsed = JSON.parse(data)
          //const jwt = JolocomLib.parse.interactionToken.fromJWT(parsed)
          const userData = parsed.data
          console.log(userData);

          this.personalDetails = {
            firstName: userData.givenName,
            lastName: userData.familyName,
            //emailAddress: receivedData.email
          }
          this.$bus.$emit('modal-hide', 'modal-jolo-user')
          //this.personalDetails.emailAddress = 'foo@example.com';
          this.sendDataToCheckout()
        })
      }).catch(err => {
        console.log(err)
      })
    },
    getQrCode (randomId: string) {
      const socket = io('/qr-code', {transports: ['websocket'], query: { userId: randomId } })
      return new Promise<string>(resolve => {
        socket.on(randomId, (qrCode: string) => resolve(qrCode))
      })
    },
    
    awaitUserData(randomId: string): Promise<string>  {
      const socket = io(`/sso-status`, {
        query: { userId: randomId }
      })
    
      return new Promise<string>(resolve => {
        socket.on(randomId, (data: string) => resolve(data))
      })
    }
  },

  updated () {
    // Perform focusing on a field, name of which is passed through 'focusedField' prop
    if (this.focusedField && !this.isValidationError) {
      if (this.focusedField === 'password') {
        this.isValidationError = true
        this.password = ''
        this.rPassword = ''
        this.$refs['password'].setFocus('password')
      }
    }
  },
  beforeMount () {
    this.$bus.$on('user-after-loggedin', this.onLoggedIn)
  },
  destroyed () {
    this.$bus.$off('user-after-loggedin', this.onLoggedIn)
  }
}