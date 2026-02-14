import { distribute, startPage } from './database.js';
async function initializePage() 
{
	try 
	{
		// 1. Fill products first and wait for completion
		await distribute(); 
		
		// 2. Now call other methods; products[] is guaranteed to be full
		startPage(); 
	} 
	catch (error) 
	{
		console.error("Initialization failed:", error);
	}
}
// Trigger initialization on load
window.addEventListener('DOMContentLoaded', initializePage);
