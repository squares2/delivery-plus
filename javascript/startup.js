import { startPage } from './database.js';
async function initializePage() 
{
	try 
	{
		startPage(); 
	} 
	catch (error) 
	{
		console.error("Initialization failed:", error);
	}
}
window.addEventListener('DOMContentLoaded', initializePage);
