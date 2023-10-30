const express = require('express');
const { AppExtensionsSDK } = require('@pipedrive/app-extensions-sdk')
const xml2js = require('xml2js');


const app = express();

app.get('/', async (req,res) =>  {
    try {
        const aresRequest = await fetch(`https://wwwinfo.mfcr.cz/cgi-bin/ares/darv_std.cgi?ico=22821074`);
        const aresResponse = await aresRequest.text();

        xml2js.parseString(aresResponse, (err, result) => {
            if (err) {
                console.error('XML Parsing Error:', err);
            }else {
                const companyName = result["are:Ares_odpovedi"]["are:Odpoved"][0]["are:Zaznam"][0]["are:Obchodni_firma"][0];
                console.log("companyName",companyName);
            }
        });
    } catch (e) {
        console.error('Error fetching data:', e);
        res.status(500).send('Error fetching data from the API');
    }
})

app.listen("8000",(err)=> {
    if(err) console.log(err);
    console.log("Server listening on port","8000")
})