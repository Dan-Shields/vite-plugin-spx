// import the shared js module and the index.css directly (testing for cyclical assets in the manifest.json)
import '../lib/index.css'
import shared from '../lib/shared_module'
shared()
console.log('this is graphic 2')
