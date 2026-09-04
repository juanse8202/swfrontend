import api from "./axios";

export function iniciarSesion(datos) {
  return api.post("/auth/login/", datos);
}