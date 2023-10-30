const functions = require('firebase-functions');
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const Pipedrive = require('pipedrive')
const bodyParser = require('body-parser');
const xml2js = require('xml2js');
const cors = require('cors')
const axios = require('axios');
const db  = require('./utils/firebase-admin');
const { default: ApiClient } = require('pipedrive/dist/ApiClient');
const dotenv = require('dotenv').config()


app.use(cors());

const storeNewToken = async(pdUserId,pdCompanyId,hookdeckWhUrl,hookdeckWhId,accessToken,refreshToken) => {
    const documentRefCompanies = db.collection('companies')
    const documentRefUsers = db.collection('users')
    try{
        const createCompanyRecord = await documentRefCompanies.doc(`${pdCompanyId}`).set({
            ico_field_id:'',
            company_users:[pdUserId],
            hookdeck_wh_url: hookdeckWhUrl,
            hookdeck_wh_id: hookdeckWhId
        });
        const createUserRecord = await documentRefUsers.doc(`${pdUserId}`).set({
            company_id: pdCompanyId,
            user_access_token: accessToken,
            user_refresh_token: refreshToken
        });
        return {
            createCompanyRecord,createUserRecord
        }
      } catch (e) {
        console.log('error occured when saving data to firestore',e)
      }
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
                            "xxx": {
                                "$neq": {
                                    "$ref": "previous['xxx']"
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
        return {
            'hookdeckWebhookUrl': hookdeckRequest.data.source.url,
            'hookdeckConnectionId': hookdeckRequest.data.id
        }
    } catch(e) {
        console.log(e)
    };
}

const getPipedriveUserData = async(accessToken) => {
    try{
        const defaultClient = new Pipedrive.ApiClient();
        const oauth2 = defaultClient.authentications.oauth2;
        oauth2.accessToken = accessToken;
    
        const api = new Pipedrive.UsersApi(defaultClient)
        const userData = await api.getCurrentUser()
        return userData
    } catch(e) {
        console.log("error when calling Pipedrive/me",e)
    }
}

const createPipedriveOrganizationWebhook = async(hookdeckUrl,accessToken,refreshToken) => {
    try{
        const defaultClient = new Pipedrive.ApiClient();
        let oauth2 = defaultClient.authentications.oauth2;
        oauth2.accessToken = accessToken;
        oauth2.refreshToken = refreshToken;
        oauth2.clientId = process.env.PIPEDRIVE_CLIENT_ID
        oauth2.clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET

        const api =  new Pipedrive.WebhooksApi(defaultClient);
        const webhookParameters =  Pipedrive.AddWebhookRequest.constructFromObject({
            subscription_url: hookdeckUrl,
            event_action: 'updated',
            event_object: 'organization'
        })
        const pipedriveRequest = await api.addWebhook(webhookParameters)
        return pipedriveRequest.data
    } catch(e) {
        console.log("error when creating Pipedrive/webhook",e)
    }
}

app.get('/api/installation', async (req, res) => {
    const requestCode = req.query.code
    const client_id = '167934462ff8f4ba'
    const client_secret = '3918b7ab38e0f40c590ef18691239d407f7a2da7'
    const authorizationHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`
    try{
        const postData = `grant_type=authorization_code&code=${encodeURIComponent(requestCode)}&redirect_uri=${encodeURIComponent('https://us-central1-pdares.cloudfunctions.net/app/api/installation')}`;
        const exchangeToken = await axios.post('https://oauth.pipedrive.com/oauth/token',postData,{
            headers: { 
                'Authorization': authorizationHeader,
                'content-type': 'application/x-www-form-urlencoded'
            }
        })
        console.log("exchangeToken",JSON.stringify(exchangeToken.data))

        const currentUserData = await getPipedriveUserData(exchangeToken.data.access_token) // get PD/me data
        const { data: {id:pipedriveUserId,company_id:pipedriveCompanyId}} = currentUserData

        const hookdeckWebhook = await createHookdeckWebHook(pipedriveUserId,pipedriveCompanyId) //předělat do jedné velké funkce, která poběží nezávisle na FE ?
        const pipedriveWebhook = await createPipedriveOrganizationWebhook(hookdeckWebhook.hookdeckWebhookUrl,exchangeToken.data.access_token,exchangeToken.data.refresh_token) //creat PD webhook
        const saveUserCompanyInfoFirestore = await storeNewToken(pipedriveUserId,pipedriveCompanyId,hookdeckWebhook.hookdeckWebhookUrl,hookdeckWebhook.hookdeckConnectionId,exchangeToken.data.access_token,exchangeToken.data.refresh_token)
        console.log(pipedriveWebhook,saveUserCompanyInfoFirestore)

        const redirectUrl = encodeURIComponent(exchangeToken.data.api_domain)

        res.redirect(`https://pdares.web.app/welcome?redirectUrl=${redirectUrl}`)
    }catch(e) {
        res.status(404).send('Unable to install the app')
        console.log(e)
    };
});

app.get('/api/handlePipedriveRequest', async (req, res) => {
    const reqId = req.query.id
    const companyId = req.query.companyId
    const userId = req.query.userId
    try {
        const verifyToken = jwt.verify(req.query.token, '3918b7ab38e0f40c590ef18691239d407f7a2da7');
        res.redirect(`https://pdares.web.app/?reqId=${reqId}&companyId=${companyId}&userId=${userId}`);
    } catch (error) {
        console.error('JWT verification failed:', error);
        res.status(403).send('JWT token is invalid or expired');
    }
});

app.get('/api/organizationFields',  async (req, res) => {
    const {userId,companyId} = req.query
    const loadUserFromFirestore = async (userId) => {
        try{
            const getUser = await db.collection('users').doc(`${userId}`).get()
            const userData = getUser.data()
            console.log(userData)
            return userData
        } catch(e) {
           console.log("error when creating Pipedrive/webhook",e)
       }
    }

    const firebaseUserData = await loadUserFromFirestore(userId)
    const userAccessToken = firebaseUserData.user_access_token
    const userRefreshToken = firebaseUserData.user_refresh_token

    const defaultClient = new Pipedrive.ApiClient();
    let oauth2 = defaultClient.authentications.oauth2;
    oauth2.accessToken = userAccessToken;
    oauth2.refreshToken = userRefreshToken;
    oauth2.clientId = process.env.PIPEDRIVE_CLIENT_ID
    oauth2.clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET

    const api =  new Pipedrive.OrganizationFieldsApi(defaultClient);
    const orgFields = await api.getOrganizationFields()

    res.send(orgFields).status(200)
});

app.post('/api/createField',bodyParser.json(), async (req, res) => {
    const defaultClient = new Pipedrive.ApiClient();

    let apiToken = defaultClient.authentications.api_key;
    apiToken.apiKey = '050e54478dacaf2994157c8558f85ef77e5d7a9b';

    const api = new Pipedrive.OrganizationFieldsApi(defaultClient)
    const fieldConstructor = Pipedrive.FieldCreateRequest.constructFromObject({
        name:'Ico_2',
        fieldType:'text'
    });
    
    const createField = async () => {
        try{
            const pdResponse = await api.addOrganizationField(fieldConstructor)
            console.log("field created",JSON.stringify(pdResponse))
            res.send('Field created successfully').status(200)
        } catch(e) {
            console.log('error',e)
        }
    }
    createField()
});

app.post('/api/webhook/pipedriveWhUpdate', async (req, res) => {
    const companyId = req.body.meta.company_id
    const userId = req.body.meta.user_id
    console.log("post user_id",userId)

    const loadUserFromFirestore = async (userId) => {
        console.time('load firebase user')
        try{
            const getUser = await db.collection('users').doc(`${userId}`).get()
            const userData = getUser.data()
            console.log("load user from firestore", userData)
            console.timeEnd('load firebase user')
            return userData
        } catch(e) {
            console.log('error when loading user from firestore',e)
       }
    }
    
    const firebaseUserData = await loadUserFromFirestore(userId)
    const userAccessToken = firebaseUserData.user_access_token
    const userRefreshToken = firebaseUserData.user_refresh_token
    
    const loadCompanyFromFirestore = async (companyId) => {
        console.time('load firebase company');
        try {
            const getCompany = await db.collection('companies').doc(`${companyId}`).get();
            const companyData = getCompany.data();
            console.timeEnd('load firebase company');
            return companyData;
        } catch (e) {
            console.log("error when fetching company from Firestore", e);
        }
    }

    const firestoreCompanyData = await loadCompanyFromFirestore(companyId)
    const icoFieldKey = firestoreCompanyData.ico_field_id
    const currentIcoFieldValue = req.body.current[icoFieldKey]

    try {
        console.time('ares request')
        const aresRequest =  await axios.get(`https://wwwinfo.mfcr.cz/cgi-bin/ares/darv_std.cgi?ico=${currentIcoFieldValue}`);
        const aresResponse = await aresRequest.data
        console.timeEnd('ares request')
        const parseAresResponse = xml2js.parseString(aresResponse, async (err, result) => {
        if (err) {
                console.error('XML Parsing Error:', err);
        }else {
            console.time('pipedrive SDK')
                const companyName = result["are:Ares_odpovedi"]["are:Odpoved"][0]["are:Zaznam"][0]["are:Obchodni_firma"][0];
                // udělat funkci mimo / middleware, která se postará o zápis + PD init

                const defaultClient = new Pipedrive.ApiClient();
                let oauth2 = defaultClient.authentications.oauth2;
                oauth2.accessToken = userAccessToken;
                oauth2.refreshToken = userRefreshToken;
                oauth2.clientId = process.env.PIPEDRIVE_CLIENT_ID
                oauth2.clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET

                let apiInstance = new Pipedrive.OrganizationsApi(defaultClient);
                let orgId = req.body.current.id
                let opts = Pipedrive.UpdateOrganization.constructFromObject({
                    "name": "test2"
                })
                console.timeEnd('pipedrive SDK')

                const updatePdOrganizationTitle =  async () => {
                    console.time('pipedrive Update')
                    try {
                        const pdResponse = await apiInstance.updateOrganization(orgId, opts)
                        console.log("ICO updated, content:",JSON.stringify(pdResponse))
                        console.timeEnd('pipedrive Update')
                    } catch (e) {
                        console.log('error',e)
                    }
                }

                await updatePdOrganizationTitle()
                console.log("companyName",companyName);
                res.status(200).send(companyName);
            }
        });
    } catch (e) {
        console.error('Error fetching data:', e);
        res.status(500).send('Error fetching data from the API');
    }
});

app.post('/api/handlePipedriveRequest', async (req, res) => {
    console.log(req.body)
    const companyId = req.body.companyId
    const pipedriveIcoFieldKey = req.body.pipedriveFiledKey
    const loadCompanyFromFirestore = async (companyId) => {
        try{
            const getCompany = await db.collection('companies').doc(`${companyId}`).get()
            const companyData = getCompany.data()
            return companyData
        } catch(e) {
           console.log("error when fetching company from Firestore",e)
       }
    }
    const firestoreCompanyData = await loadCompanyFromFirestore(companyId)
    const hookdeckConnectionId = firestoreCompanyData.hookdeck_wh_id

    const updateHookdeckWebhook = async(connectionId) => {
        try{
            const hookdeckApiUrl = `https://api.hookdeck.com/2023-07-01/connections/${connectionId}`
            const requestBody = {
                rules: [
                    {
                        type: "filter",
                        body: {
                            "$and": [
                                {
                                    "current": {
                                        [pipedriveIcoFieldKey]: {
                                            "$neq": {
                                                "$ref": `previous['${pipedriveIcoFieldKey}']`
                                            }
                                        }
                                    }
                                },
                                {
                                    "current": {
                                        [pipedriveIcoFieldKey]: {
                                            "$neq": null
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
            const hookdeckRequest = await axios.put(hookdeckApiUrl,requestBody,{
                headers: {
                    'Authorization': `Bearer ${process.env.HOOKDECK_API_KEY}`,
                    'content-type': 'application/json'
                }
            })
            return hookdeckRequest.data
        }catch(e){
            console.log(e)
        }
    }

    const updateFirestoreIcoField = async(icoFieldKey,pdCompanyId) => {
        const documentRefCompanies = db.collection('companies')
        try{
            await documentRefCompanies.doc(`${pdCompanyId}`).update({
                ico_field_id:`${icoFieldKey}`
            });
        }catch(e){
            console.log(e)
        }
    };

    const hookdeckRequest = await updateHookdeckWebhook(hookdeckConnectionId)
    updateFirestoreIcoField(pipedriveIcoFieldKey,companyId)

    console.log("hookdeckUpdate",hookdeckRequest)
})

exports.app = functions.https.onRequest(app);
