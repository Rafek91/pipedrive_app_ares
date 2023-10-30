import React, { useEffect,useState } from "react";
import Select from "react-select";
import { useLocation } from "react-router-dom";
import AppExtensionsSDK from '@pipedrive/app-extensions-sdk';

function IframeComponent() {
  const serverURL = process.env.REACT_APP_SERVER_URL
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const reqId = searchParams.get('reqId');
  const companyId = searchParams.get('companyId');
  const userId = searchParams.get('userId');

  const [dropdown,setDropdown] = useState([])
  const [SDK,setSDKinstance] = useState(null)
  const [dropdownAvailability,setDropdownAvailability] = useState(false)
  const [dropdownValue,setDropdownValue] = useState(null)

  useEffect(() => {
    fetchOrgFields()
  },[])
  
  useEffect(() => {
    if (reqId) {
      initializeSDK(reqId);
    }
  }, [reqId]);

  const createDropdown = (items) => {
    const optionsStructure = items.data
    .filter(item => item.last_updated_by_user_id !== undefined && item.last_updated_by_user_id !== null && item.active_flag == true)
    .map((item) =>{
      return ({
        value: item.key,
        label: item.name
      })
    })
    return optionsStructure
  }
  
  const fetchOrgFields = async () => {
      try {
          const request = await fetch(`${serverURL}/organizationFields?userId=${userId}&companyId=${companyId}`)
          const responseData = await request.json()
          const output = await createDropdown(responseData)
          setDropdown(output)
      } catch (e) {
          console.log(e)
      }
  }

  const submitButton = () => {
    if(dropdownValue){
      console.log(dropdownValue,userId,companyId)
      setDropdownAvailability(true)
      const changeHookdeckFilter = fetch(`${serverURL}/handlePipedriveRequest`,{
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({
          pipedriveFiledKey: dropdownValue.value,
          userId: userId,
          companyId: companyId
        })
      })
    } else {
      setDropdownAvailability(false)
    }
  }

  const initializeSDK = (reqId) => {
    const getCustomUISDK = async () => {
      try {
        console.log("Initializing SDK...");
        const SDK = await new AppExtensionsSDK({ identifier: `${reqId}` }).initialize();
        setSDKinstance(SDK)
      } catch (err) {
        console.error("Error initializing SDK:", err);
      }
    };
    getCustomUISDK();
  };

  return (
    <div className="form-container">
        <h1>Nastavení</h1>
        <div className="text">
          <p>Zvolte prosím, které z vašich polí je IČO. Je nutné, aby toto pole mělo datový typ "Text". <br />Pokud pole ještě nemáte vytvořeno, tak jej prosím vytvořte a pak proveďte výběr.</p>
        </div>
        <Select
        options={dropdown}
        className="dropdown"
        placeholder="Vyberte IČO"
        isDisabled={dropdownAvailability}
        value={dropdownValue}
        onChange={(item)=>{
          setDropdownValue(item)
        }}
        />
        <button onClick={submitButton}>Potvrdit</button>
      </div>
  )
}

export default IframeComponent;
