import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import VueGtag from "vue-gtag-next";

Vue.config.productionTip = false

Vue.use(ElementUI)
Vue.use(VueGtag, {
  property: {
    id: "G-8DV4ZQMCEE"
  }
});

new Vue({
  render: h => h(App),
}).$mount('#app')
