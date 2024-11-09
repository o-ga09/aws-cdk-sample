package controller_test

import (
	"bytes"
	"clean-serverless-book-sample/domain"
	"clean-serverless-book-sample/mocks"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPostUsers_201 新規作成 成功時
func TestPostUsers_201(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// リクエストパラメータ設定
	body := map[string]interface{}{
		"user_name": "テスト名前",
		"email":     "test@example.com",
	}
	bodyStr, err := json.Marshal(body)
	assert.NoError(t, err)

	req, _ := http.NewRequest("POST", fmt.Sprintf("/v1/users"), bytes.NewBuffer(bodyStr))
	req.Header.Set("Content-Type", "application/json")

	// 新規作成処理
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// レスポンスコードをチェック
	assert.Equal(t, 201, w.Code)

	// JSONからmap型に変換
	var resBody map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &resBody)
	assert.NoError(t, err)

	// IDをチェック
	assert.Equal(t, "1", resBody["id"])

	// DynamoDBに保存されたデータをチェック
	user, err := tables.UserOperator.GetUserByID(1)
	assert.NoError(t, err)
	assert.Equal(t, body["user_name"].(string), user.Name)
	assert.Equal(t, body["email"].(string), user.Email)
}

// TestPostUsers_400 新規登録 バリデーションエラー時
func TestPostUsers_400(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	cases := []struct {
		Request  map[string]interface{}
		Expected map[string]interface{}
	}{
		// 未入力の場合
		{
			Request: map[string]interface{}{
				"user_name": "",
				"email":     "",
			},
			Expected: map[string]interface{}{
				"user_name": "ユーザー名を入力してください。",
				"email":     "メールアドレスを入力してください。",
			},
		},
		// メールアドレスの形式が不正の場合
		{
			Request: map[string]interface{}{
				"user_name": "hoge",
				"email":     "test@",
			},
			Expected: map[string]interface{}{
				"email": "メールアドレスの形式が不正です。",
			},
		},
	}

	for i, c := range cases {
		msg := fmt.Sprintf("Case:%d", i+1)

		body := c.Request
		bodyStr, err := json.Marshal(body)
		assert.NoError(t, err)

		req, _ := http.NewRequest("POST", "/v1/users", bytes.NewBuffer(bodyStr))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, 400, w.Code, msg)

		var resBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &resBody)
		assert.NoError(t, err)

		errors := resBody["errors"].(map[string]interface{})
		assert.Equal(t, c.Expected, errors, msg)
	}
}

// TestPutUser_200 更新 正常時
func TestPutUser_200(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// 更新用モックデータを作成
	userMock, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	// 更新リクエストパラメータ
	body := map[string]interface{}{
		"user_name": "テスト名前更新",
		"email":     "test_update@example.com",
	}
	bodyStr, err := json.Marshal(body)
	assert.NoError(t, err)

	req, _ := http.NewRequest("PUT", fmt.Sprintf("/v1/users/%d", userMock.ID), bytes.NewBuffer(bodyStr))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// レスポンスコードをチェック
	assert.Equal(t, 200, w.Code)

	// JSONからmap型に変換
	var resBody map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &resBody)
	assert.NoError(t, err)

	// DynamoDBのデータが更新されているかをチェック
	user, err := tables.UserOperator.GetUserByID(userMock.ID)
	assert.NoError(t, err)
	assert.Equal(t, body["user_name"].(string), user.Name)
	assert.Equal(t, body["email"].(string), user.Email)
}

// TestPutUser_200_dup 更新 メールアドレスを変更しない場合(重複エラーにならないこと)
func TestPutUser_200_dup(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// モックデータを作成
	userMock, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	// 更新パラメータ
	body := map[string]interface{}{
		"user_name": "テスト名前更新",
		"email":     userMock.Email,
	}
	bodyStr, err := json.Marshal(body)
	assert.NoError(t, err)

	req, _ := http.NewRequest("PUT", fmt.Sprintf("/v1/users/%d", userMock.ID), bytes.NewBuffer(bodyStr))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// ステータスコードをチェック
	assert.Equal(t, 200, w.Code)

	// JSONからmap型に変換
	var resBody map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &resBody)
	assert.NoError(t, err)

	// DynamoDBのデータをチェック
	user, err := tables.UserOperator.GetUserByID(userMock.ID)
	assert.NoError(t, err)
	assert.Equal(t, body["user_name"].(string), user.Name)
	assert.Equal(t, body["email"].(string), user.Email)
}

// TestPutUser_400 更新 バリデーションエラー時
func TestPutUser_400(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// 更新用モックデータを作成
	userMock, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	cases := []struct {
		Request  map[string]interface{}
		Expected map[string]interface{}
	}{
		// 未入力の場合
		{
			Request: map[string]interface{}{
				"user_name": "",
				"email":     "",
			},
			Expected: map[string]interface{}{
				"user_name": "ユーザー名を入力してください。",
				"email":     "メールアドレスを入力してください。",
			},
		},
		// メールアドレスの形式が不正な場合
		{
			Request: map[string]interface{}{
				"user_name": "hoge",
				"email":     "test@",
			},
			Expected: map[string]interface{}{
				"email": "メールアドレスの形式が不正です。",
			},
		},
	}

	for i, c := range cases {
		msg := fmt.Sprintf("Case:%d", i+1)

		body := c.Request
		bodyStr, err := json.Marshal(body)
		assert.NoError(t, err)

		req, _ := http.NewRequest("PUT", fmt.Sprintf("/v1/users/%d", userMock.ID), bytes.NewBuffer(bodyStr))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, 400, w.Code, msg)

		var resBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &resBody)
		assert.NoError(t, err)

		errors := resBody["errors"].(map[string]interface{})
		assert.Equal(t, c.Expected, errors, msg)
	}
}

// TestGetUser 取得 正常時
func TestGetUser(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// 取得用モックデータを作成
	userMock, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	req, _ := http.NewRequest("GET", fmt.Sprintf("/v1/users/%d", userMock.ID), nil)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// ステータスコードをチェック
	assert.Equal(t, 200, w.Code)

	// 取得したデータをチェック
	var body map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &body)
	assert.NoError(t, err)
	assert.Equal(t, float64(userMock.ID), body["id"])
	assert.Equal(t, userMock.Name, body["user_name"])
	assert.Equal(t, userMock.Email, body["email"])
}

// TestGetUsers 一覧取得
func TestGetUsers(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// モックデータを作成
	userMock1, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	userMock2, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    2,
		Name:  "Name_2",
		Email: "test2@example.com",
	})
	assert.NoError(t, err)

	req, _ := http.NewRequest("GET", "/v1/users", nil)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// ステータスコードをチェック
	assert.Equal(t, 200, w.Code)

	// 取得したデータをチェック
	var body map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &body)
	assert.NoError(t, err)

	users := body["users"].([]interface{})
	assert.Len(t, users, 2)

	user1 := users[1].(map[string]interface{})
	assert.Equal(t, float64(userMock1.ID), user1["id"])
	assert.Equal(t, userMock1.Name, user1["user_name"])
	assert.Equal(t, userMock1.Email, user1["email"])

	user2 := users[0].(map[string]interface{})
	assert.Equal(t, float64(userMock2.ID), user2["id"])
	assert.Equal(t, userMock2.Name, user2["user_name"])
	assert.Equal(t, userMock2.Email, user2["email"])
}

// TestDeleteUser 削除
func TestDeleteUser(t *testing.T) {
	// テスト用DynamoDBを設定
	tables := mocks.SetupDB(t)
	defer tables.Cleanup()

	router := setupRouter()

	// 削除用モックデータを作成
	userMock, err := tables.UserOperator.CreateUser(&domain.UserModel{
		ID:    1,
		Name:  "Name_1",
		Email: "test1@example.com",
	})
	assert.NoError(t, err)

	req, _ := http.NewRequest("DELETE", fmt.Sprintf("/v1/users/%d", userMock.ID), nil)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// ステータスコードをチェック
	assert.Equal(t, 200, w.Code)

	// DynamoDBからデータが削除されているかをチェック
	users, err := tables.UserOperator.GetUsers()
	assert.NoError(t, err)
	assert.Len(t, users, 0)
}
