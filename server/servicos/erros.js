// Erro causado por dados inválidos de quem chamou (vira HTTP 400 na API).
class ErroValidacao extends Error {}

class NaoEncontrado extends Error {}

module.exports = { ErroValidacao, NaoEncontrado };
