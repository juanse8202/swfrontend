// Keep this small transport boundary independent from the Axios singleton so
// its multipart body can be tested with a mock client.
export async function postXmiFormData(httpClient, diagramaId, formData, requestOptions = {}) {
  const response = await httpClient.post(`/diagramas/diagramas/${diagramaId}/importar-xmi/`, formData, requestOptions);
  return response.data;
}
