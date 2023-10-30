app.get('/api/test', async (req, res) => {
   try{
       const getUser = await db.collection('users').doc('3000557').get()
       const userData = getUser.data()
       console.log(userData)

   } catch(e) {
      console.log("error when creating Pipedrive/webhook",e)
  }

  const createHookdeckWebHook = async(userId,companyId) => {
   try{
       const hookdeckApiUrl = 'https://api.hookdeck.com/2023-07-01/connections'
       const requestBody = {
           name: `${userId}_${companyId}_pipedrive_ares`,
           source: {
               name:'pipedrive'
           },
           destination: {
               name: 'firebaseApp',
               url: 'https://us-central1-pdares.cloudfunctions.net/app/api/webhook/pipedriveWhUpdate'
           },
           rules: [
               {
                   type: "filter",
                   body: {
                       "current": {
                           "41916c98588ddc128ebaf1b9604dab5c282ff07c": {
                               "$neq": {
                                   "$ref": "previous['41916c98588ddc128ebaf1b9604dab5c282ff07c']"
                               }
                           }
                       }
                   }
               }
           ]
       }
       const hookdeckRequest = await axios.post(hookdeckApiUrl,requestBody,{
           headers: {
               'Authorization': `Bearer ${process.env.HOOKDECK_API_KEY}`,
               'content-type': 'application/json'
           }
       })

/*         console.log(hookdeckRequest.data)
*/        return {
           'hookdeckWebhookUrl': hookdeckRequest.data.source.url,
           'hookdeckConnectionId': hookdeckRequest.data.id
       }
   } catch(e) {
       console.log("ERROR",e)
   };
}
createHookdeckWebHook('22244','1234556')
})