<template>
  <modal name="modal-jolo-user" :width="620">
    <img :src="image">
  </modal>
</template>

<script>
import { mapState } from 'vuex'
import Modal from 'theme/components/core/Modal'

export default {
  name: 'QrModal',
  data () {
    return {
      image: null
    }
  },
  computed: {
    ...mapState({
      activeElem: state => state.ui.authElem
    })
  },
  methods: {
    onShow (name, state, params) {
      this.image = params.image
    }
  },
  components: {
    Modal
  },
  beforeMount () {
    this.$bus.$on('modal-show', this.onShow)
  }
}
</script>

<style scoped>
  .modal {
    font-size: 18px;
  }
</style>
