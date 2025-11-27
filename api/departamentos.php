<?php
require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        getDepartamentos();
        break;
    case 'POST':
        createDepartamento();
        break;
    case 'PUT':
        updateDepartamento();
        break;
    case 'DELETE':
        deleteDepartamento();
        break;
    default:
        sendError('Método no permitido', 405);
}

// READ - Obtener todos los departamentos
function getDepartamentos() {
    $conn = getConnection();
    
    $sql = "SELECT id, direccion, numero, descripcion, estado FROM departamentos ORDER BY id ASC";
    $stmt = $conn->prepare($sql);
    
    if ($stmt === false) {
        $conn->close();
        sendError('Error al preparar consulta: ' . $conn->error, 500);
    }
    
    if (!$stmt->execute()) {
        $error = $stmt->error;
        $stmt->close();
        $conn->close();
        sendError('Error al ejecutar consulta: ' . $error, 500);
    }
    
    $result = $stmt->get_result();
    
    $departamentos = [];
    while ($row = $result->fetch_assoc()) {
        // Asegurar que los valores numéricos sean números
        $row['id'] = intval($row['id']);
        $row['numero'] = intval($row['numero']);
        $departamentos[] = $row;
    }
    
    $stmt->close();
    $conn->close();
    
    // Siempre devolver un array, incluso si está vacío
    sendResponse(['departamentos' => $departamentos]);
}

// CREATE - Crear nuevo departamento
function createDepartamento() {
    $conn = getConnection();
    
    // Obtener datos del cuerpo de la petición
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['direccion']) || !isset($data['numero']) || 
        !isset($data['descripcion']) || !isset($data['estado'])) {
        $conn->close();
        sendError('Faltan campos requeridos', 400);
    }
    
    $direccion = trim($data['direccion']);
    $numero = intval($data['numero']);
    $descripcion = trim($data['descripcion']);
    $estado = trim($data['estado']);
    
    $sql = "INSERT INTO departamentos (direccion, numero, descripcion, estado) VALUES (?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);
    
    if ($stmt === false) {
        $conn->close();
        sendError('Error al preparar consulta: ' . $conn->error, 500);
    }
    
    $stmt->bind_param("siss", $direccion, $numero, $descripcion, $estado);
    
    if ($stmt->execute()) {
        $newId = $conn->insert_id;
        $stmt->close();
        $conn->close();
        sendResponse([
            'success' => true,
            'message' => 'Departamento creado exitosamente',
            'id' => $newId
        ], 201);
    } else {
        $error = $stmt->error;
        $stmt->close();
        $conn->close();
        sendError('Error al crear departamento: ' . $error, 500);
    }
}

// UPDATE - Actualizar departamento
function updateDepartamento() {
    $conn = getConnection();
    
    // Obtener ID de la URL o del cuerpo
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['id'])) {
        $conn->close();
        sendError('ID de departamento requerido', 400);
    }
    
    $id = intval($data['id']);
    
    if (!isset($data['direccion']) || !isset($data['numero']) || 
        !isset($data['descripcion']) || !isset($data['estado'])) {
        $conn->close();
        sendError('Faltan campos requeridos', 400);
    }
    
    $direccion = trim($data['direccion']);
    $numero = intval($data['numero']);
    $descripcion = trim($data['descripcion']);
    $estado = trim($data['estado']);
    
    $sql = "UPDATE departamentos SET direccion = ?, numero = ?, descripcion = ?, estado = ? WHERE id = ?";
    $stmt = $conn->prepare($sql);
    
    if ($stmt === false) {
        $conn->close();
        sendError('Error al preparar consulta: ' . $conn->error, 500);
    }
    
    $stmt->bind_param("sissi", $direccion, $numero, $descripcion, $estado, $id);
    
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            $stmt->close();
            $conn->close();
            sendResponse([
                'success' => true,
                'message' => 'Departamento actualizado exitosamente'
            ]);
        } else {
            $stmt->close();
            $conn->close();
            sendError('Departamento no encontrado', 404);
        }
    } else {
        $error = $stmt->error;
        $stmt->close();
        $conn->close();
        sendError('Error al actualizar departamento: ' . $error, 500);
    }
}

// DELETE - Eliminar departamento
function deleteDepartamento() {
    $conn = getConnection();
    
    // Obtener ID de la URL
    $id = isset($_GET['id']) ? intval($_GET['id']) : null;
    
    if (!$id) {
        // Intentar obtener del cuerpo
        $data = json_decode(file_get_contents('php://input'), true);
        $id = isset($data['id']) ? intval($data['id']) : null;
    }
    
    if (!$id) {
        $conn->close();
        sendError('ID de departamento requerido', 400);
    }
    
    $sql = "DELETE FROM departamentos WHERE id = ?";
    $stmt = $conn->prepare($sql);
    
    if ($stmt === false) {
        $conn->close();
        sendError('Error al preparar consulta: ' . $conn->error, 500);
    }
    
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            $stmt->close();
            $conn->close();
            sendResponse([
                'success' => true,
                'message' => 'Departamento eliminado exitosamente'
            ]);
        } else {
            $stmt->close();
            $conn->close();
            sendError('Departamento no encontrado', 404);
        }
    } else {
        $error = $stmt->error;
        $stmt->close();
        $conn->close();
        sendError('Error al eliminar departamento: ' . $error, 500);
    }
}

