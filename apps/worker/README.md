
# Worker — fase 2

Ainda não implementado. Será um processo BullMQ separado, com retries, checkpoints, outbox, quotas e idempotência. Não há envio externo nem listener de webhook ativo na fase 1. O simulador puro está em packages/workflow-engine e não é um worker real.
