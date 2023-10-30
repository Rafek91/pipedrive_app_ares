import React, { useState, useEffect } from "react";
import Select from "react-select";
import IframeComponent from "./IframeComponent";
import '../style.css';
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";


function AppSettings() {
  const [dropdown,setDropdown] = useState([])

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
          const request = await fetch('https://us-central1-pdares.cloudfunctions.net/app/api/organizationFields')
          const responseData = await request.json()
          const output = await createDropdown(responseData)
          setDropdown(output)
      } catch (e) {
          console.log(e)
      }
  }

  const handleICOcreation = async () => {
    try {
      const request = await fetch('https://us-central1-pdares.cloudfunctions.net/app/api/createField',{
        method: 'POST',
      })
      const response = await request.text()
      console.log(response)
    } catch (e) {
      console.log(e)
    }
  }

  useEffect(() => {
    fetchOrgFields()
  },[])

  return  (
    <Router>
      <Routes>
        <Route path="/" element={<IframeComponent />} />
      </Routes>
      <div className="form-container">
        <h1>Nastavení</h1>
        <p>Pokud pole IČO ještě nemáte vytvořeno, rádi ho vytvoříme za vás. Klikněte prosím na tlačítko "Vytvořit IČO"</p>
        <Select
        options={dropdown}
        className="dropdown"
        placeholder="Vyberte IČO"
        onChange={(item)=>{console.log(item)}}
        />
        <button onClick={fetchOrgFields}>Potvrdit</button>
        <button onClick={handleICOcreation}>Vytvořit IČO</button>
      </div>
    </Router>
    );
  }

export default AppSettings
